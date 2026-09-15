import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { PickupAddressWrite } from "./pickup-address.repository.js";

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

/**
 * Ce qu'on relit d'un point de retrait : où il est, ce qu'il remise, et à qui.
 *
 * Les clientèles partent même sans remise : ce sont les cases que l'admin a
 * laissées, et une remise reposée plus tard s'appliquera à elles.
 */
function placeAndDiscount(point: PickupAddressWrite): Record<string, unknown> {
  const { adjustment, audiences } = point.discount;
  return {
    label: point.label,
    ville: point.ville,
    codePostal: point.codePostal,
    discount:
      adjustment === null
        ? null
        : adjustment.mode === "percent"
          ? { bp: adjustment.bp }
          : { cents: adjustment.cents },
    discountAudiences: { b2b: audiences.b2b, b2c: audiences.b2c },
  };
}

export class PickupAddressCreatedEvent implements JournaledEvent {
  constructor(
    readonly pickupId: string,
    readonly point: PickupAddressWrite,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PICKUP_ADDRESS_FACTS.created,
      subjectType: "pickup_address",
      subjectId: this.pickupId,
      payload: placeAndDiscount(this.point),
    };
  }
}

export class PickupAddressUpdatedEvent implements JournaledEvent {
  constructor(
    readonly pickupId: string,
    readonly point: PickupAddressWrite,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PICKUP_ADDRESS_FACTS.updated,
      subjectType: "pickup_address",
      subjectId: this.pickupId,
      payload: placeAndDiscount(this.point),
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
