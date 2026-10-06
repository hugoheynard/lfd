import type { DoorstepRule } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { ACCOUNT_FACTS } from "./account-facts.js";
import type { DeliveryAddressRef, NamedRef } from "./journal-names.js";

/**
 * **La décision réglée d'avance à la porte, redéfinie sur une adresse**
 * (`documentation/livraisons/a-la-porte.md`, B3 bis, LB-Q6) — ou rendue
 * au réglage global (`rule: null`). Il ne part que si la valeur a changé.
 * L'adresse est citée par son id et son lieu, jamais par son libellé.
 */
export class DeliveryDoorstepRuleSetEvent implements JournaledEvent {
  constructor(
    readonly company: NamedRef,
    readonly address: DeliveryAddressRef,
    readonly rule: DoorstepRule | null,
  ) {}

  journalFact(): JournalFact {
    const type: JournalFactType = ACCOUNT_FACTS.deliveryDoorstepRuleSet;
    return {
      type,
      subjectType: "company",
      subjectId: this.company.id,
      payload: {
        subjectLabel: this.company.name,
        address: { ...this.address },
        rule: this.rule,
      },
    };
  }
}
