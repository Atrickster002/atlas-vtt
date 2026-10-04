/**
 * The open template sessions of each app: one core per template id, counted
 * by the handles views hold, in any window. The last release writes what is
 * pending and only then lets the core go, unless a view opened it again
 * meanwhile.
 */

import type { App } from 'obsidian';
import type { TemplateId } from '../model/templateTypes';
import { SessionCore } from './sessionCore';

interface OpenSession {
  core: SessionCore;
  holders: number;
}

const registries = new WeakMap<App, Map<TemplateId, OpenSession>>();

function registryOf(app: App): Map<TemplateId, OpenSession> {
  let registry = registries.get(app);
  if (!registry) {
    registry = new Map();
    registries.set(app, registry);
  }
  return registry;
}

/** The session core of a template, made on first use; null when the library knows no template by this id. */
export function acquireSessionCore(app: App, id: TemplateId): SessionCore | null {
  const registry = registryOf(app);
  const open = registry.get(id);
  if (open) {
    open.holders += 1;
    return open.core;
  }
  const core = SessionCore.create(app, id);
  if (core) registry.set(id, { core, holders: 1 });
  return core;
}

/** A holder lets go; the last one writes what is pending, then the core is disposed. */
export function releaseSessionCore(app: App, core: SessionCore): Promise<void> {
  const registry = registryOf(app);
  const open = registry.get(core.id);
  if (!open || open.core !== core || open.holders === 0) return Promise.resolve();
  open.holders -= 1;
  if (open.holders > 0) return Promise.resolve();
  return core.flushForExit().finally(() => {
    if (open.holders > 0 || registry.get(core.id) !== open) return;
    registry.delete(core.id);
    core.dispose();
  });
}

/** Writes the pending edits of one template's session, if one is open (before a rename, delete or export). */
export function flushTemplateSession(app: App, id: TemplateId): Promise<void> {
  return registries.get(app)?.get(id)?.core.flush() ?? Promise.resolve();
}

/** Writes the pending edits of every open session. */
export async function flushTemplateSessions(app: App): Promise<void> {
  await settleAll(openSessions(app), (core) => core.flush());
}

/** Before Obsidian quits: every pending edit written, drafts in conflict kept as copies. */
export async function flushTemplateSessionsForExit(app: App): Promise<void> {
  await settleAll(openSessions(app), (core) => core.flushForExit());
}

/**
 * The plugin unloads: every session starts its last write and is let go.
 * Obsidian does not await an unload, so the writes finish on their own.
 */
export async function releaseTemplateSessions(app: App): Promise<void> {
  const open = openSessions(app);
  registries.delete(app);
  await settleAll(open, (core) => core.flushForExit().finally(() => core.dispose()));
}

function openSessions(app: App): OpenSession[] {
  return [...(registries.get(app)?.values() ?? [])];
}

/** Runs `task` for every session; one that fails keeps none of the others from running, and the first failure is thrown after. */
async function settleAll(open: readonly OpenSession[], task: (core: SessionCore) => Promise<void>): Promise<void> {
  const results = await Promise.allSettled(open.map(({ core }) => task(core)));
  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failed) throw failed.reason;
}
