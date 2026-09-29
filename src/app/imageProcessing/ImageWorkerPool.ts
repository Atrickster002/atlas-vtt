import type { ImageJob, ImageJobRequest, ImageJobResponse, ImageJobResult } from './imageJob';

/** Raised when a worker cannot read the source format; the caller may decode it on the main thread. */
export class ImageDecodeError extends Error {}

export interface ImageJobOptions {
  signal?: AbortSignal | undefined;
  /**
   * Large images (maps) run one at a time: each holds its decoded pixels, up to
   * hundreds of megabytes, while it is processed.
   */
  heavy?: boolean;
  /** Bitmaps moved to the worker instead of copied, such as a source decoded on the main thread. */
  transfer?: ImageBitmap[];
}

interface PendingJob {
  id: number;
  job: ImageJob;
  heavy: boolean;
  transfer: ImageBitmap[];
  signal: AbortSignal | undefined;
  settled: boolean;
  resolve: (result: ImageJobResult) => void;
  reject: (reason: unknown) => void;
  onAbort: () => void;
}

interface WorkerSlot {
  worker: Worker;
  job: PendingJob | null;
  timeout: number | null;
}

const MAX_HEAVY_JOBS = 1;
/** Idle workers are stopped after this long, so no threads linger between imports. */
const IDLE_TIMEOUT_MS = 30_000;
/** A worker that has not answered after this long is stopped; even huge maps finish well within it. */
const JOB_TIMEOUT_MS = 5 * 60_000;
const STOPPED_MESSAGE = 'Image processing has stopped.';

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('The image job was cancelled.', 'AbortError');
}

/**
 * Runs image jobs on a bounded set of dedicated workers, first in, first out.
 * Workers start on demand and stop when idle; a crashed worker fails only its
 * own job and is replaced by the next one that is needed.
 */
export class ImageWorkerPool {
  private readonly slots: WorkerSlot[] = [];
  private readonly queue: PendingJob[] = [];
  private nextId = 1;
  private idleTimer: number | null = null;
  private disposed = false;

  constructor(
    private readonly maxWorkers: number,
    private readonly createWorker: () => Worker,
    private readonly idleTimeoutMs = IDLE_TIMEOUT_MS,
    private readonly jobTimeoutMs = JOB_TIMEOUT_MS,
  ) {}

  run(job: ImageJob, options: ImageJobOptions = {}): Promise<ImageJobResult> {
    if (this.disposed) return Promise.reject(new Error(STOPPED_MESSAGE));
    const { signal } = options;
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    return new Promise<ImageJobResult>((resolve, reject) => {
      const pending: PendingJob = {
        id: this.nextId++,
        job,
        heavy: options.heavy ?? false,
        transfer: options.transfer ?? [],
        signal,
        settled: false,
        resolve,
        reject,
        onAbort: () => this.abort(pending),
      };
      signal?.addEventListener('abort', pending.onAbort, { once: true });
      this.queue.push(pending);
      this.pump();
    });
  }

  /** Stops every worker and fails all queued and running jobs. */
  dispose(): void {
    this.disposed = true;
    this.clearIdleTimer();
    for (const slot of this.slots.splice(0)) {
      this.clearJobTimeout(slot);
      slot.worker.terminate();
      if (slot.job) this.fail(slot.job, new Error(STOPPED_MESSAGE));
    }
    for (const pending of this.queue.splice(0)) this.drop(pending, new Error(STOPPED_MESSAGE));
  }

  private pump(): void {
    let heavyRunning = this.slots.filter(slot => slot.job?.heavy).length;
    for (let index = 0; index < this.queue.length;) {
      const pending = this.queue[index]!;
      if (pending.heavy && heavyRunning >= MAX_HEAVY_JOBS) {
        index += 1;
        continue;
      }
      const slot = this.freeSlot();
      if (!slot) break;
      this.queue.splice(index, 1);
      if (pending.heavy) heavyRunning += 1;
      this.start(slot, pending);
    }
    this.stopWhenIdle();
  }

  private freeSlot(): WorkerSlot | null {
    const idle = this.slots.find(slot => !slot.job);
    if (idle) return idle;
    return this.slots.length < this.maxWorkers ? this.addSlot() : null;
  }

  private addSlot(): WorkerSlot {
    const slot: WorkerSlot = { worker: this.createWorker(), job: null, timeout: null };
    slot.worker.addEventListener('message', (event: MessageEvent<ImageJobResponse>) => this.finish(slot, event.data));
    slot.worker.addEventListener('error', (event: ErrorEvent) => {
      event.preventDefault();
      this.crash(slot, event.message || 'The image worker stopped unexpectedly.');
    });
    slot.worker.addEventListener('messageerror', () => this.crash(slot, 'Could not read the image worker’s reply.'));
    this.slots.push(slot);
    return slot;
  }

  private start(slot: WorkerSlot, pending: PendingJob): void {
    slot.job = pending;
    const request: ImageJobRequest = { id: pending.id, job: pending.job };
    try {
      slot.worker.postMessage(request, pending.transfer);
    } catch (error) {
      slot.job = null;
      this.fail(pending, error);
      return;
    }
    slot.timeout = window.setTimeout(() => this.crash(slot, 'Processing the image took too long.'), this.jobTimeoutMs);
  }

  private finish(slot: WorkerSlot, response: ImageJobResponse): void {
    const pending = slot.job;
    if (!pending || pending.id !== response.id) return;
    this.clearJobTimeout(slot);
    slot.job = null;
    if (response.ok) this.succeed(pending, response.result);
    else this.fail(pending, response.decodeFailed ? new ImageDecodeError(response.message) : new Error(response.message));
    this.pump();
  }

  private crash(slot: WorkerSlot, message: string): void {
    this.clearJobTimeout(slot);
    slot.worker.terminate();
    const index = this.slots.indexOf(slot);
    if (index >= 0) this.slots.splice(index, 1);
    if (slot.job) this.fail(slot.job, new Error(message));
    this.pump();
  }

  /** A queued job leaves the queue; a running one is failed now and its result ignored. */
  private abort(pending: PendingJob): void {
    const reason = abortReason(pending.signal!);
    const index = this.queue.indexOf(pending);
    if (index < 0) {
      this.fail(pending, reason);
      return;
    }
    this.queue.splice(index, 1);
    this.drop(pending, reason);
    this.stopWhenIdle();
  }

  /** Fails a job that never reached a worker and frees the bitmaps it would have transferred. */
  private drop(pending: PendingJob, reason: unknown): void {
    for (const bitmap of pending.transfer) bitmap.close();
    this.fail(pending, reason);
  }

  private succeed(pending: PendingJob, result: ImageJobResult): void {
    if (pending.settled) return;
    this.settle(pending);
    pending.resolve(result);
  }

  private fail(pending: PendingJob, reason: unknown): void {
    if (pending.settled) return;
    this.settle(pending);
    pending.reject(reason);
  }

  private settle(pending: PendingJob): void {
    pending.settled = true;
    pending.signal?.removeEventListener('abort', pending.onAbort);
  }

  private stopWhenIdle(): void {
    this.clearIdleTimer();
    if (this.slots.length === 0 || this.queue.length > 0 || this.slots.some(slot => slot.job)) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;
      for (const slot of this.slots.splice(0)) slot.worker.terminate();
    }, this.idleTimeoutMs);
  }

  private clearJobTimeout(slot: WorkerSlot): void {
    if (slot.timeout === null) return;
    window.clearTimeout(slot.timeout);
    slot.timeout = null;
  }

  private clearIdleTimer(): void {
    if (this.idleTimer === null) return;
    window.clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}
