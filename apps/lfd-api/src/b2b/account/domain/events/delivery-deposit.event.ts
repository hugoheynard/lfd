import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { ACCOUNT_FACTS } from "./account-facts.js";
import type { DeliveryAddressRef, NamedRef } from "./journal-names.js";

/**
 * **« Dépôt autorisé » réglé sur une adresse de livraison**
 * (`documentation/livraisons/a-la-porte.md`, AP-D5).
 *
 * UN fait, quel que soit l'auteur — le client sur son carnet, le staff sur sa
 * route à part : un geste, un nom, l'auteur est sur la ligne. Il ne part que
 * si la valeur a changé. L'adresse est citée par son id et son lieu, jamais
 * par son libellé (`journal-names.ts`).
 */
export class DeliveryDepositSetEvent implements JournaledEvent {
  constructor(
    readonly company: NamedRef,
    readonly address: DeliveryAddressRef,
    readonly depositAllowed: boolean,
  ) {}

  journalFact(): JournalFact {
    const type: JournalFactType = ACCOUNT_FACTS.deliveryDepositSet;
    return {
      type,
      subjectType: "company",
      subjectId: this.company.id,
      payload: {
        subjectLabel: this.company.name,
        address: { ...this.address },
        depositAllowed: this.depositAllowed,
      },
    };
  }
}
