import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { LateFeeSetting } from "../../orders/domain/ports/order-late-fee.reader.js";

/**
 * **Les faits de la surtaxe de commande tardive** (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, 2026-09-19).
 *
 * La surtaxe est ce qu'une dérogation coûte au client. Quand il la conteste —
 * « on m'a facturé 5 € de retard, qui a décidé ça ? » —, la question est ce que
 * le réglage disait **ce jour-là**, et qui l'avait posé. La ligne du réglage ne
 * le dira pas : elle est unique, réécrite à chaque geste, et supprimée au
 * retrait. Le journal en est la seule mémoire.
 *
 * La charge porte donc **l'avant et l'après** entiers : un montant et un taux,
 * dans l'unité de la colonne — `cents` pour un montant fixe (centimes HT), `bp`
 * pour un pourcentage (points de base), comme le contrat `CartAdjustment`.
 */
export const ORDER_LATE_FEE_FACTS = {
  set: "order_late_fee.set",
  cleared: "order_late_fee.cleared",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/**
 * Le sujet des faits : le réglage, UNIQUE pour toute la maison. Son identifiant
 * est la clé de sa ligne — le `CHECK` de la migration l'impose.
 */
const SUBJECT_TYPE = "order_late_fee";
export const ORDER_LATE_FEE_SUBJECT_ID = "singleton";

/** Un réglage tel que le journal le relit — la forme du contrat HTTP (`fee`). */
function settingOf(setting: LateFeeSetting): Record<string, unknown> {
  return { fee: setting.adjustment, vatRatePercent: setting.vatRatePercent };
}

/** Fait : **la surtaxe est posée ou remplacée**. `before` est `null` sur une première pose. */
export class OrderLateFeeSetEvent implements JournaledEvent {
  constructor(
    readonly before: LateFeeSetting | null,
    readonly after: LateFeeSetting,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ORDER_LATE_FEE_FACTS.set,
      subjectType: SUBJECT_TYPE,
      subjectId: ORDER_LATE_FEE_SUBJECT_ID,
      payload: {
        before: this.before === null ? null : settingOf(this.before),
        after: settingOf(this.after),
      },
    };
  }
}

/**
 * Fait : **la surtaxe est retirée** — les dérogations deviennent gratuites.
 * `before` dit ce qu'elle valait : c'est tout ce que le retrait efface.
 */
export class OrderLateFeeClearedEvent implements JournaledEvent {
  constructor(readonly before: LateFeeSetting) {}

  journalFact(): JournalFact {
    return {
      type: ORDER_LATE_FEE_FACTS.cleared,
      subjectType: SUBJECT_TYPE,
      subjectId: ORDER_LATE_FEE_SUBJECT_ID,
      payload: { before: settingOf(this.before) },
    };
  }
}
