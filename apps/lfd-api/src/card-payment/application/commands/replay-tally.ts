import type {
  FirstPaymentDivergence,
  FirstPaymentsReplayed,
} from "./replay-first-payments.command.js";

/** Ce qu'un écart nomme : le sujet, la référence, ce que le sujet en dit. */
export interface DivergentReference {
  readonly subject: { readonly type: string; readonly id: string };
  readonly providerRef: string;
  /** Le règlement que le sujet déclare, ou `unclaimed` : il ne reconnaît pas la référence. */
  readonly settled: string;
}

/** Le décompte d'un rattrapage — ce que le cron rend et journalise. */
export class ReplayTally {
  private examined = 0;
  private inserted = 0;
  private advanced = 0;
  private inStep = 0;
  private readonly diverged: FirstPaymentDivergence[] = [];

  examine(): void {
    this.examined += 1;
  }

  insert(): void {
    this.inserted += 1;
  }

  advance(): void {
    this.advanced += 1;
  }

  keepInStep(): void {
    this.inStep += 1;
  }

  diverge(reference: DivergentReference, line: string | null): void {
    this.diverged.push({
      subjectType: reference.subject.type,
      subjectId: reference.subject.id,
      providerRef: reference.providerRef,
      line,
      subject: reference.settled,
    });
  }

  report(): FirstPaymentsReplayed {
    return {
      status: "replayed",
      examined: this.examined,
      inserted: this.inserted,
      advanced: this.advanced,
      inStep: this.inStep,
      diverged: [...this.diverged],
    };
  }
}
