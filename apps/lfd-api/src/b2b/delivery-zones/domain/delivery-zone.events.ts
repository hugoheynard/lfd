import type { DeliveryZonePayload } from "@lfd/contracts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/**
 * **Les faits des zones de livraison.**
 *
 * Une zone décide ce qu'un client paie pour être livré chez lui. Le geste est
 * rare, il est fait par un agent, et il se voit sur la facture de tous ceux dont
 * le code postal y tombe — trois raisons de savoir qui l'a posé. Ils partent
 * donc tracés, dans la transaction de l'écriture.
 *
 * La charge dit **le prix et la portée**, pas la liste des préfixes : c'est le
 * montant qu'on vient vérifier, et un tableau de deux cents codes postaux dans
 * un journal ne se relit pas. Leur NOMBRE, lui, dit si la zone a grossi.
 */
export const DELIVERY_ZONE_FACTS = {
  created: "delivery_zone.created",
  updated: "delivery_zone.updated",
  removed: "delivery_zone.removed",
} as const;

/** Le tarif d'une zone, tel qu'on le relit : un pourcentage ou des centimes. */
function feeOf(payload: DeliveryZonePayload): Record<string, unknown> {
  return {
    label: payload.label,
    postalPrefixes: payload.postalPrefixes.length,
    fee: payload.fee.mode === "percent" ? { bp: payload.fee.bp } : { cents: payload.fee.cents },
  };
}

export class DeliveryZoneCreatedEvent implements JournaledEvent {
  constructor(
    readonly zoneId: string,
    readonly payload: DeliveryZonePayload,
  ) {}

  journalFact(): JournalFact {
    return {
      type: DELIVERY_ZONE_FACTS.created,
      subjectType: "delivery_zone",
      subjectId: this.zoneId,
      payload: feeOf(this.payload),
    };
  }
}

export class DeliveryZoneUpdatedEvent implements JournaledEvent {
  constructor(
    readonly zoneId: string,
    readonly payload: DeliveryZonePayload,
  ) {}

  journalFact(): JournalFact {
    return {
      type: DELIVERY_ZONE_FACTS.updated,
      subjectType: "delivery_zone",
      subjectId: this.zoneId,
      payload: feeOf(this.payload),
    };
  }
}

/**
 * La suppression n'emporte que l'identifiant : la zone n'existe plus, et c'est
 * le fait qui l'a créée — toujours dans le flux — qui dit ce qu'elle facturait.
 */
export class DeliveryZoneRemovedEvent implements JournaledEvent {
  constructor(readonly zoneId: string) {}

  journalFact(): JournalFact {
    return {
      type: DELIVERY_ZONE_FACTS.removed,
      subjectType: "delivery_zone",
      subjectId: this.zoneId,
      payload: {},
    };
  }
}
