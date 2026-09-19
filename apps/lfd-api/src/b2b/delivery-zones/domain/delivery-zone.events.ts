import type { DeliveryZonePayload } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

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
 * un journal ne se relit pas. Leur NOMBRE, lui, dit si la zone a grossi — sous
 * `postalPrefixCount` depuis le lot B du plan des phrases (2026-09-19) : il
 * s'appelait `postalPrefixes`, un nom de liste pour un compte, et les lignes
 * d'avant le gardent.
 *
 * Chaque fait porte le nom de la zone en `subjectLabel` (D6), la suppression
 * comprise : c'est le nom qu'elle avait au moment où elle a disparu.
 */
export const DELIVERY_ZONE_FACTS = {
  created: "delivery_zone.created",
  updated: "delivery_zone.updated",
  removed: "delivery_zone.removed",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Le tarif d'une zone, tel qu'on le relit : un pourcentage ou des centimes. */
function feeOf(payload: DeliveryZonePayload): Record<string, unknown> {
  return {
    subjectLabel: payload.label,
    label: payload.label,
    postalPrefixCount: payload.postalPrefixes.length,
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
 * La suppression n'emporte que le nom de la zone : elle n'existe plus, et
 * c'est le fait qui l'a créée — toujours dans le flux — qui dit ce qu'elle
 * facturait.
 */
export class DeliveryZoneRemovedEvent implements JournaledEvent {
  constructor(
    readonly zoneId: string,
    /** Le nom de la zone au moment de la supprimer. */
    readonly label: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: DELIVERY_ZONE_FACTS.removed,
      subjectType: "delivery_zone",
      subjectId: this.zoneId,
      payload: { subjectLabel: this.label },
    };
  }
}
