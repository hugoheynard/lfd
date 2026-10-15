import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";

/**
 * **Les faits des décisions de catalogue** (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, tranche (b),
 * 2026-09-19).
 *
 * Une décision de catalogue change ce qui est vendu. La ligne de décision n'en
 * garde que le dernier état — elle est réécrite à chaque geste. « Qui a masqué
 * cet article, et depuis quand ? » : le journal en est la seule mémoire.
 *
 * Le sujet est l'**article** (`catalog_item`, par son SKU) : c'est lui qu'on
 * cherche quand on se pose la question.
 *
 * Chaque fait porte le **nom** de l'article au moment du geste (`subjectLabel`,
 * lot B du plan des phrases) — celui que le référentiel avait livré : un
 * article renommé depuis se lit sous l'ancien nom sur les lignes d'avant.
 */

/** L'article dont parle un fait : son SKU, et son nom du moment. */
export interface CatalogItemSubject {
  readonly sku: string;
  readonly name: string;
}
/**
 * Les types écrits aujourd'hui. Les quatre faits de prix décidé
 * (`catalog_item.b2b_price_set` / `_cleared`, `public_price_set` /
 * `_cleared`) ne s'écrivent plus depuis le lot D (2026-10-15) : ils restent
 * au catalogue des faits, `retired`, pour que le journal passé se lise.
 */
export const CATALOG_ITEM_FACTS = {
  hidden: "catalog_item.hidden",
  shown: "catalog_item.shown",
  hiddenPublic: "catalog_item.hidden_public",
  shownPublic: "catalog_item.shown_public",
  featured: "catalog_item.featured",
  unfeatured: "catalog_item.unfeatured",
  publicReviewApproved: "catalog_item.public_review_approved",
  proReviewApproved: "catalog_item.pro_review_approved",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "catalog_item";

/** Un fait qui ne porte que l'article : le type dit tout le geste. */
abstract class CatalogItemFlagEvent implements JournaledEvent {
  protected abstract readonly type: JournalFactType;

  constructor(readonly item: CatalogItemSubject) {}

  journalFact(): JournalFact {
    return {
      type: this.type,
      subjectType: SUBJECT_TYPE,
      subjectId: this.item.sku,
      payload: { subjectLabel: this.item.name, sku: this.item.sku },
    };
  }
}

/**
 * Fait : **l'article sort de la vitrine B2B**. Masquer éteint aussi la mise en
 * avant (`CatalogItem.hide`) : ce fait-là la dit, sans second fait.
 */
/**
 * ⚠️ **`catalog_item.hidden` a changé de portée le 2026-09-21**, et les faits
 * déjà écrits ne le savent pas : ils masquaient des DEUX boutiques, faute d'en
 * avoir deux. Sa phrase disait pourtant déjà « du catalogue professionnel ».
 *
 * Le type n'est pas renommé — un fait est immuable, et un renommage de valeur
 * est une migration de données, pas un geste de confort. Ce qui est ajouté est
 * son jumeau PUBLIC ; l'ancien devient ce que sa phrase disait déjà.
 */
export class CatalogItemHiddenEvent extends CatalogItemFlagEvent {
  protected readonly type = CATALOG_ITEM_FACTS.hidden;
}

/** Fait : **l'article revient dans la vitrine B2B**. */
export class CatalogItemShownEvent extends CatalogItemFlagEvent {
  protected readonly type = CATALOG_ITEM_FACTS.shown;
}

/** Fait : **l'article est mis en avant** dans la boutique. */
export class CatalogItemHiddenPublicEvent extends CatalogItemFlagEvent {
  protected readonly type = CATALOG_ITEM_FACTS.hiddenPublic;
}

export class CatalogItemShownPublicEvent extends CatalogItemFlagEvent {
  protected readonly type = CATALOG_ITEM_FACTS.shownPublic;
}

export class CatalogItemFeaturedEvent extends CatalogItemFlagEvent {
  protected readonly type = CATALOG_ITEM_FACTS.featured;
}

/** Fait : **l'article n'est plus mis en avant**. */
export class CatalogItemUnfeaturedEvent extends CatalogItemFlagEvent {
  protected readonly type = CATALOG_ITEM_FACTS.unfeatured;
}

/**
 * Fait : **l'article est validé pour la boutique publique** (lot 3 de
 * `documentation/pim/plan-catalogue-synchronise-par-audience.md`). Arrivé du
 * référentiel, il n'était servi qu'aux pros ; le public le voit désormais,
 * s'il n'est pas masqué.
 */
export class CatalogItemPublicReviewApprovedEvent extends CatalogItemFlagEvent {
  protected readonly type = CATALOG_ITEM_FACTS.publicReviewApproved;
}

/**
 * Fait : **l'article est validé pour les pros** (décision de Hugo du
 * 2026-10-15, option 2) : arrivé du référentiel, il n'était ni vu ni
 * commandable par les pros ; il l'est désormais, s'il n'est pas masqué.
 */
export class CatalogItemProReviewApprovedEvent extends CatalogItemFlagEvent {
  protected readonly type = CATALOG_ITEM_FACTS.proReviewApproved;
}
