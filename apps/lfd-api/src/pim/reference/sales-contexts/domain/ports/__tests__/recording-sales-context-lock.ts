import { SalesContextLock } from "../sales-context.lock.js";

/**
 * Le verrou des contextes, doublé : il note ce qu'on lui demande, dans
 * l'ordre. Une suite qui veut prouver que le verrou précède la lecture passe le
 * même `journal` à ses autres doubles.
 */
export class RecordingSalesContextLock extends SalesContextLock {
  constructor(readonly journal: string[] = []) {
    super();
  }

  forArchival(key: string): Promise<void> {
    this.journal.push(`lock:archival:${key}`);
    return Promise.resolve();
  }

  forUse(keys: readonly string[]): Promise<void> {
    this.journal.push(`lock:use:${[...keys].sort().join(",")}`);
    return Promise.resolve();
  }
}
