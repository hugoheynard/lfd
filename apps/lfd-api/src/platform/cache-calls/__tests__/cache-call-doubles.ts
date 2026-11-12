import { CallDeadline, type Deadlined } from "../call-deadline.js";

/**
 * Un délai tenu à la main : `late` déclare tout appel en retard sans
 * l'attendre — c'est un appel qui ne répond jamais, vu du repli.
 */
export class ScriptedCallDeadline extends CallDeadline {
  late = false;
  readonly limits: number[] = [];

  within<T>(work: Promise<T>, limitMs: number): Promise<Deadlined<T>> {
    this.limits.push(limitMs);
    if (this.late) {
      return Promise.resolve({ kind: "late" });
    }
    return work.then((value): Deadlined<T> => ({ kind: "in_time", value }));
  }
}
