import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/** Le type du fait journalisé. */
const JOURNAL_TYPE = "packing_stock.sent_to_shop" satisfies JournalFactType;

/** Une ligne sortie de la réserve. */
export interface SentToShopLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/**
 * **Des pièces sont sorties de la réserve vers une boutique** (plan A1, lot
 * A1.4) — journalisé dans la transaction de la sortie, une fois par envoi.
 * Sujet : la réserve de la journée, libellée par sa date ; le point est cité
 * avec son nom du moment, ou son seul id.
 *
 * Aucun fait durable : personne n'écoute, le réassort né du même geste est
 * écrit par le commerce dans la même transaction.
 */
export class PackingStockSentToShopEvent implements JournaledEvent {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly siteId: string,
    readonly siteLabel: string | null,
    readonly resupplyId: string,
    readonly lines: readonly SentToShopLine[],
  ) {}

  journalFact(): JournalFact {
    return {
      type: JOURNAL_TYPE,
      subjectType: "packing_stock",
      subjectId: this.serviceDay,
      payload: {
        subjectLabel: this.serviceDay,
        serviceDay: this.serviceDay,
        site: this.siteLabel === null ? this.siteId : { id: this.siteId, name: this.siteLabel },
        resupplyId: this.resupplyId,
        lines: this.lines.map((line) => ({ ...line })),
      },
    };
  }
}
