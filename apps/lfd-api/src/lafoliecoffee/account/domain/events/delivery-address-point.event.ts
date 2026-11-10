import type { AddressPointKind } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { ACCOUNT_FACTS } from "./account-facts.js";
import type { DeliveryAddressRef, NamedRef } from "./journal-names.js";

/**
 * **Un point d'adresse corrigé depuis une suggestion des livraisons**
 * (`documentation/livraisons/livreur/gps-y-aller-et-position.md`, §6) — la porte
 * ou le stationnement. Il ne part que si le point a changé.
 *
 * La charge dit LEQUEL, jamais les coordonnées : l'adresse est citée par son
 * id et son lieu, comme les autres faits du carnet.
 */
export class DeliveryAddressPointCorrectedEvent implements JournaledEvent {
  constructor(
    readonly company: NamedRef,
    readonly address: DeliveryAddressRef,
    readonly kind: AddressPointKind,
  ) {}

  journalFact(): JournalFact {
    const type: JournalFactType = ACCOUNT_FACTS.deliveryAddressPointCorrected;
    return {
      type,
      subjectType: "company",
      subjectId: this.company.id,
      payload: {
        subjectLabel: this.company.name,
        address: { ...this.address },
        point: this.kind,
      },
    };
  }
}
