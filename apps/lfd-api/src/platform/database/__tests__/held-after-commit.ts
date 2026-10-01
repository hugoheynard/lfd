import { AfterCommit } from "../after-commit.js";
import type { AfterCommitCallback } from "../transaction.store.js";

/**
 * Un « après validation » **retenu** : les rappels attendent `commit()`.
 *
 * Le double laisse le test dire où passe la validation — avant, rien n'est
 * parti ; après, tout. `discard()` joue l'unité qui échoue. La mécanique
 * réelle (file de l'unité la plus externe) se prouve sur le store et en e2e.
 */
export class HeldAfterCommit extends AfterCommit {
  private readonly held: AfterCommitCallback[] = [];

  defer(callback: AfterCommitCallback): void {
    this.held.push(callback);
  }

  async commit(): Promise<void> {
    for (const callback of this.held.splice(0)) {
      await callback();
    }
  }

  discard(): void {
    this.held.splice(0);
  }
}
