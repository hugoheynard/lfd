import { VatRateLock } from "../vat-rate.lock.js";

/**
 * Le verrou des taux, doublé : il note ce qu'on lui demande, dans l'ordre. Une
 * suite qui veut prouver que le verrou précède la lecture passe le même
 * `journal` à ses autres doubles.
 */
export class RecordingVatRateLock extends VatRateLock {
  constructor(readonly journal: string[] = []) {
    super();
  }

  forArchival(rateId: string): Promise<void> {
    this.journal.push(`lock:archival:${rateId}`);
    return Promise.resolve();
  }

  forUse(rateIds: readonly string[]): Promise<void> {
    this.journal.push(`lock:use:${[...rateIds].sort().join(",")}`);
    return Promise.resolve();
  }
}
