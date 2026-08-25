import type { PickupAddressPayload } from "@lfd/contracts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/**
 * **Les faits des points de retrait.**
 *
 * Un point de retrait porte une **remise** : venir chercher soi-même coûte moins
 * cher. C'est une décision commerciale, pas un réglage d'adresse — la modifier
 * change le prix payé par tous ceux qui retirent là, sans qu'aucune commande ne
 * porte la trace de qui l'a décidé.
 *
 * Le défaut aussi compte : c'est le point que la plateforme propose quand le
 * client n'a rien choisi, donc celui où finira le colis de qui n'a rien dit.
 */
export const PICKUP_ADDRESS_FACTS = {
  created: "pickup_address.created",
  updated: "pickup_address.updated",
  removed: "pickup_address.removed",
  defaultSet: "pickup_address.default_set",
} as const;

/** Ce qu'on relit d'un point de retrait : où il est, et ce qu'il remise. */
function placeAndDiscount(payload: PickupAddressPayload): Record<string, unknown> {
  const { discount } = payload;
  return {
    label: payload.label,
    ville: payload.ville,
    codePostal: payload.codePostal,
    discount:
      discount === null
        ? null
        : discount.mode === "percent"
          ? { bp: discount.bp }
          : { cents: discount.cents },
  };
}

export class PickupAddressCreatedEvent implements JournaledEvent {
  constructor(
    readonly pickupId: string,
    readonly payload: PickupAddressPayload,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PICKUP_ADDRESS_FACTS.created,
      subjectType: "pickup_address",
      subjectId: this.pickupId,
      payload: placeAndDiscount(this.payload),
    };
  }
}

export class PickupAddressUpdatedEvent implements JournaledEvent {
  constructor(
    readonly pickupId: string,
    readonly payload: PickupAddressPayload,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PICKUP_ADDRESS_FACTS.updated,
      subjectType: "pickup_address",
      subjectId: this.pickupId,
      payload: placeAndDiscount(this.payload),
    };
  }
}

export class PickupAddressRemovedEvent implements JournaledEvent {
  constructor(readonly pickupId: string) {}

  journalFact(): JournalFact {
    return {
      type: PICKUP_ADDRESS_FACTS.removed,
      subjectType: "pickup_address",
      subjectId: this.pickupId,
      payload: {},
    };
  }
}

export class DefaultPickupAddressSetEvent implements JournaledEvent {
  constructor(readonly pickupId: string) {}

  journalFact(): JournalFact {
    return {
      type: PICKUP_ADDRESS_FACTS.defaultSet,
      subjectType: "pickup_address",
      subjectId: this.pickupId,
      payload: {},
    };
  }
}
