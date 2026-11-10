import type { AudiencePickupDiscount } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

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
 * Chaque fait porte le nom du point en `subjectLabel` (D6 du plan des phrases,
 * 2026-09-19) — la suppression comprise, qui n'emportait jusque-là que
 * l'identifiant.
 *
 * `pickup_address.default_set` n'est plus publié depuis le 2026-10-15 (le site
 * par défaut a disparu) ; le type reste au registre des contrats pour que les
 * faits déjà écrits se relisent.
 */
export const PICKUP_ADDRESS_FACTS = {
  created: "pickup_address.created",
  updated: "pickup_address.updated",
  removed: "pickup_address.removed",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/**
 * Ce qu'on relit d'un point de retrait : où il est, et ce qu'il remise à
 * chaque clientèle — la réduction, son mode de portée et le nombre de ses
 * règles (2026-10-22).
 */
function placeAndDiscount(point: PickupAddressWrite): Record<string, unknown> {
  const { b2b, b2c } = point.discount;
  return {
    subjectLabel: point.label,
    label: point.label,
    ville: point.ville,
    codePostal: point.codePostal,
    discounts: { b2b: summaryOf(b2b), b2c: summaryOf(b2c) },
  };
}

function summaryOf(discount: AudiencePickupDiscount | null): Record<string, unknown> | null {
  if (discount === null) {
    return null;
  }
  const { adjustment } = discount;
  return {
    discount: adjustment.mode === "percent" ? { bp: adjustment.bp } : { cents: adjustment.cents },
    scope: discount.scope,
    categoryRules: discount.categories.length,
    productRules: discount.products.length,
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
  constructor(
    readonly pickupId: string,
    /** Le nom du point au moment de le retirer. */
    readonly label: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PICKUP_ADDRESS_FACTS.removed,
      subjectType: "pickup_address",
      subjectId: this.pickupId,
      payload: { subjectLabel: this.label },
    };
  }
}

/**
 * **Le fait de l'horaire public d'un point** — plan
 * `documentation/commandes/passation/plan-creneaux-de-retrait.md`, lot A.
 *
 * Il se journalise pour la même raison que la remise : ce réglage décide de ce
 * qu'un visiteur peut choisir — et une capacité posée trop serrée, un jour
 * fermé par erreur, se lisent le lendemain comme des ventes qui n'ont pas eu
 * lieu, sans que rien ne dise qui l'a décidé.
 *
 * ⚠️ Son préfixe est inscrit dans les **deux** classements du journal (serveur
 * `growth/domain/activity-module.ts`, front `admin/journal/journal-line.ts`) :
 * sans le premier il n'apparaît dans aucun filtre, sans le second la ligne
 * affiche le type brut.
 */
export const PUBLIC_PICKUP_SCHEDULE_FACTS = {
  updated: "public_pickup_schedule.updated",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/**
 * L'horaire public d'un point a été réécrit **en bloc**.
 *
 * La charge dit ce qu'on veut relire sans rouvrir la base : combien de plages,
 * combien de fermetures, et si le point est désormais réglé — c'est cette
 * dernière bascule qui change le comportement vu par un visiteur (D6).
 */
export class PublicPickupScheduleUpdatedEvent implements JournaledEvent {
  constructor(
    readonly pickupId: string,
    readonly label: string,
    readonly ruleCount: number,
    readonly closureCount: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PUBLIC_PICKUP_SCHEDULE_FACTS.updated,
      subjectType: "public_pickup_schedule",
      subjectId: this.pickupId,
      payload: {
        subjectLabel: this.label,
        label: this.label,
        ruleCount: this.ruleCount,
        closureCount: this.closureCount,
        configured: this.ruleCount > 0,
      },
    };
  }
}
