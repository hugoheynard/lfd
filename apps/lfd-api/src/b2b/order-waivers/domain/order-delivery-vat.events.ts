import type { DeliveryVatMode } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/**
 * **Le fait de la TVA de la livraison** (plan
 * `documentation/order/plan-tva-des-frais-de-port.md`, V2).
 *
 * La ligne du réglage est unique et réécrite en place : seul le journal dit
 * quel mode s'appliquait tel jour, et qui l'a choisi. Chaque commande fige le
 * sien, mais une question du comptable — « depuis quand le port est-il
 * ventilé ? » — se répond ici.
 */
export const ORDER_DELIVERY_VAT_FACTS = {
  modeSet: "order_delivery_vat.mode_set",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Le sujet : le réglage, UNIQUE. Son identifiant est la clé que le `CHECK` impose. */
const SUBJECT_TYPE = "order_delivery_vat";
export const ORDER_DELIVERY_VAT_SUBJECT_ID = "singleton";

/**
 * Fait : **le mode de TVA du port change**. `before` est le mode qui
 * S'APPLIQUAIT — `standard` quand rien n'était posé, puisque c'est ce que la
 * passation facturait.
 */
export class OrderDeliveryVatModeSetEvent implements JournaledEvent {
  constructor(
    readonly before: DeliveryVatMode,
    readonly after: DeliveryVatMode,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ORDER_DELIVERY_VAT_FACTS.modeSet,
      subjectType: SUBJECT_TYPE,
      subjectId: ORDER_DELIVERY_VAT_SUBJECT_ID,
      payload: { before: this.before, after: this.after },
    };
  }
}
