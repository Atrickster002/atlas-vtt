/**
 * Runs async jobs one at a time, the latest request winning: a job requested while
 * another runs starts once that one has settled, and of several waiting only the
 * last starts. A running job learns through `isSuperseded` that it was replaced.
 */
export class LatestRequestQueue {
  private requests = 0;
  private inFlight: Promise<unknown> = Promise.resolve();

  /** Resolves with the job's result, or with null when a later request replaced the job before it started. */
  run<T>(job: (isSuperseded: () => boolean) => Promise<T>): Promise<T | null> {
    const request = ++this.requests;
    const isSuperseded = (): boolean => request !== this.requests;
    const result = this.inFlight.then(() => (isSuperseded() ? null : job(isSuperseded)));
    this.inFlight = result.catch(() => undefined);
    return result;
  }
}
