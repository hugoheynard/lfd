import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { shipmentKeySuffix } from "../../../production/channels/packing/index.js";

/** Nom stable du fait durable — irréversible en production (plan A1, § 3). */
export const PACKING_SHEET_WITHDRAWN = "packing.sheet_withdrawn";

/** Le type du fait journalisé. */
const JOURNAL_TYPE = "packing_sheet.withdrawn" satisfies JournalFactType;

/** Une ligne revenue à la réserve : l'article, nommé du moment, et combien. */
export interface ReleasedLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/**
 * **La feuille d'une commande est retirée du colisage** (plan A1,
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * § 2.2 et § 3 ; C7 § 3.5) — annulée après l'arrêt du plan. Publié dans la
 * transaction du retrait, une fois : un second retrait ne publie rien.
 *
 * Deux formes du même fait :
 *
 * - **durable** (`packing.sheet_withdrawn`) — jour, commande, lignes rendues
 *   à la réserve. AUCUN abonné (§ 3) : s'il en vient un d'un autre bloc,
 *   `lint:durable-cross-block` s'applique. Clé
 *   `packing.sheet_withdrawn:<serviceDay>:<orderId>` — une feuille ne se
 *   retire qu'une fois ; la feuille d'un reliquat a la sienne,
 *   `…:<orderId>:r<rang>` (plan E7 reliquat, choix 6) ;
 * - **journalisé** (`packing_sheet.withdrawn`) — le sujet est la commande,
 *   comme les contenants ; c'est lui qui explique, au journal, des pièces
 *   rendues à la réserve sans retour au fournil.
 *
 * `released` est vide quand rien n'était au bac, ou que la feuille n'était
 * pas encore tirée (pierre tombale).
 */
export class PackingSheetWithdrawnEvent implements JournaledEvent, DurableEvent {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly orderId: string,
    /** Le rang de l'envoi de la feuille — 1 = la commande (plan E7 reliquat, choix 5). */
    readonly rank: number,
    readonly reference: string,
    readonly withdrawnAt: Date,
    readonly released: readonly ReleasedLine[],
  ) {}

  journalFact(): JournalFact {
    return {
      type: JOURNAL_TYPE,
      subjectType: "order",
      subjectId: this.orderId,
      payload: {
        subjectLabel: this.reference,
        serviceDay: this.serviceDay,
        released: this.released.map((line) => ({ ...line })),
      },
    };
  }

  durableFact(): DurableFact {
    return {
      type: PACKING_SHEET_WITHDRAWN,
      key:
        `${PACKING_SHEET_WITHDRAWN}:${this.serviceDay}:${this.orderId}` +
        shipmentKeySuffix(this.rank),
      payload: {
        serviceDay: this.serviceDay,
        orderId: this.orderId,
        rank: this.rank,
        reference: this.reference,
        withdrawnAt: this.withdrawnAt.toISOString(),
        released: this.released.map((line) => ({ ...line })),
      },
    };
  }
}
