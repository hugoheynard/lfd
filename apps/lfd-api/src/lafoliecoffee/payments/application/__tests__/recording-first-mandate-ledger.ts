import { FirstMandateLedger } from "../../../accounting/domain/ports/first-mandate-ledger.js";
import type { Steps } from "./payment-doubles.js";

/** Un appel au verrou, tel que la frappe l'a passé. */
export interface NotedFirstMandate {
  readonly creditorId: string;
  readonly at: Date;
}

/**
 * Le verrou du créancier imprimé, doublé : il garde chaque appel et marque sa
 * place dans le journal de bord, pour qu'on puisse affirmer qu'il tombe DANS
 * l'unité de travail de la frappe.
 *
 * Rangé hors de `payment-doubles.ts` : un port de la comptabilité, consommé par
 * la seule frappe.
 */
export class RecordingFirstMandateLedger extends FirstMandateLedger {
  readonly noted: NotedFirstMandate[] = [];

  constructor(private readonly steps?: Steps) {
    super();
  }

  note(creditorId: string, at: Date): Promise<void> {
    this.steps?.log.push("ledger:note");
    this.noted.push({ creditorId, at });
    return Promise.resolve();
  }
}
