import type { ReservedVisibility } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { CatalogItemSubject } from "./catalog-item.events.js";

/**
 * **Les faits des articles sur mesure** (plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, lot L1a). Le sujet
 * est l'article, comme pour les autres décisions de catalogue
 * (`catalog-item.events.ts`).
 */
export const MADE_TO_ORDER_FACTS = {
  // `catalog_item.made_to_order_marked` / `_unmarked` ne s'écrivent plus depuis
  // R3-1 (2026-11-02) : le sur mesure est un fait de la fiche, journalisé au
  // référentiel (`product.custom_recipe_changed`). Les faits passés restent.
  reserved: "catalog_item.reserved",
  released: "catalog_item.reservation_released",
  visibilitySet: "catalog_item.reserved_visibility_set",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "catalog_item";

/** La société d'une réservation, nommée au moment du geste — `null` si elle n'existe plus. */
export interface ReservationCompany {
  readonly companyId: string;
  readonly companyName: string | null;
}

/**
 * Fait : l'article est réservé à une société, ou ne l'est plus. Le retrait
 * expose l'article aux autres pros dès que le mur est en place (§ 4) : la
 * société est figée par son nom, pour que la ligne se lise même si elle change.
 */
export class ReservationChangedEvent implements JournaledEvent {
  constructor(
    readonly item: CatalogItemSubject,
    readonly company: ReservationCompany,
    readonly reserved: boolean,
  ) {}

  journalFact(): JournalFact {
    return {
      type: this.reserved ? MADE_TO_ORDER_FACTS.reserved : MADE_TO_ORDER_FACTS.released,
      subjectType: SUBJECT_TYPE,
      subjectId: this.item.sku,
      payload: {
        subjectLabel: this.item.name,
        sku: this.item.sku,
        companyId: this.company.companyId,
        companyName: this.company.companyName,
      },
    };
  }
}

/** Fait : la visibilité d'un article réservé, l'état après le geste. */
export class ReservedVisibilitySetEvent implements JournaledEvent {
  constructor(
    readonly item: CatalogItemSubject,
    readonly visibility: ReservedVisibility,
  ) {}

  journalFact(): JournalFact {
    return {
      type: MADE_TO_ORDER_FACTS.visibilitySet,
      subjectType: SUBJECT_TYPE,
      subjectId: this.item.sku,
      payload: { subjectLabel: this.item.name, sku: this.item.sku, visibility: this.visibility },
    };
  }
}
