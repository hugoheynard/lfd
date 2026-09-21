import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";

/**
 * **Les faits des décisions de catalogue** (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, tranche (b),
 * 2026-09-19).
 *
 * Une décision de catalogue change ce qui est vendu, ou à quel prix. La ligne
 * de décision n'en garde que le dernier état — elle est réécrite à chaque
 * geste, et **supprimée** quand plus rien n'est décidé. « Qui a masqué cet
 * article, et depuis quand ? », « qui a posé ce prix B2B, et que valait-il
 * avant ? » : le journal en est la seule mémoire.
 *
 * Le sujet est l'**article** (`catalog_item`, par son SKU) : c'est lui qu'on
 * cherche quand on se pose la question. Les prix sont en **millicentimes**,
 * l'unité des prix unitaires, et le nom du champ le dit.
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
export const CATALOG_ITEM_FACTS = {
  b2bPriceSet: "catalog_item.b2b_price_set",
  b2bPriceCleared: "catalog_item.b2b_price_cleared",
  publicPriceSet: "catalog_item.public_price_set",
  publicPriceCleared: "catalog_item.public_price_cleared",
  hidden: "catalog_item.hidden",
  shown: "catalog_item.shown",
  hiddenPublic: "catalog_item.hidden_public",
  shownPublic: "catalog_item.shown_public",
  featured: "catalog_item.featured",
  unfeatured: "catalog_item.unfeatured",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "catalog_item";

/** Un prix tel que le journal le relit : l'unité dans le nom du champ. */
function priceOf(priceMillicents: number): Record<string, unknown> {
  return { priceMillicents };
}

/**
 * Fait : **un prix B2B est posé ou remplacé**. `before` est `null` quand
 * l'article suivait jusque-là le tarif du PIM.
 */
export class CatalogItemB2bPriceSetEvent implements JournaledEvent {
  constructor(
    readonly item: CatalogItemSubject,
    readonly beforeMillicents: number | null,
    readonly afterMillicents: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: CATALOG_ITEM_FACTS.b2bPriceSet,
      subjectType: SUBJECT_TYPE,
      subjectId: this.item.sku,
      payload: {
        subjectLabel: this.item.name,
        sku: this.item.sku,
        before: this.beforeMillicents === null ? null : priceOf(this.beforeMillicents),
        after: priceOf(this.afterMillicents),
      },
    };
  }
}

/**
 * Fait : **l'article revient au tarif du PIM**. `before` dit le prix B2B
 * retiré — c'est tout ce que le retour efface.
 */
export class CatalogItemB2bPriceClearedEvent implements JournaledEvent {
  constructor(
    readonly item: CatalogItemSubject,
    readonly beforeMillicents: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: CATALOG_ITEM_FACTS.b2bPriceCleared,
      subjectType: SUBJECT_TYPE,
      subjectId: this.item.sku,
      payload: {
        subjectLabel: this.item.name,
        sku: this.item.sku,
        before: priceOf(this.beforeMillicents),
      },
    };
  }
}

/**
 * Un prix **public** tel que le journal le relit — en centimes **TTC**.
 *
 * ⚠️ Jumeau de {@link priceOf} et volontairement DISTINCT : l'unité est dans le
 * nom du champ parce qu'elle diffère. Un journal qui relirait 299 comme des
 * millicentimes afficherait « 0,00299 € » sur un croissant à 2,99 €.
 */
function publicPriceOf(ttcCents: number): Record<string, unknown> {
  return { ttcCents };
}

/**
 * Fait : **un prix public est posé ou remplacé**. `before` est `null` quand
 * l'article suivait jusque-là l'étiquette du référentiel.
 */
export class CatalogItemPublicPriceSetEvent implements JournaledEvent {
  constructor(
    readonly item: CatalogItemSubject,
    readonly beforeTtcCents: number | null,
    readonly afterTtcCents: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: CATALOG_ITEM_FACTS.publicPriceSet,
      subjectType: SUBJECT_TYPE,
      subjectId: this.item.sku,
      payload: {
        subjectLabel: this.item.name,
        sku: this.item.sku,
        before: this.beforeTtcCents === null ? null : publicPriceOf(this.beforeTtcCents),
        after: publicPriceOf(this.afterTtcCents),
      },
    };
  }
}

/**
 * Fait : **l'article revient à l'étiquette du PIM**. `before` dit le prix
 * public retiré — c'est tout ce que le retour efface.
 */
export class CatalogItemPublicPriceClearedEvent implements JournaledEvent {
  constructor(
    readonly item: CatalogItemSubject,
    readonly beforeTtcCents: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: CATALOG_ITEM_FACTS.publicPriceCleared,
      subjectType: SUBJECT_TYPE,
      subjectId: this.item.sku,
      payload: {
        subjectLabel: this.item.name,
        sku: this.item.sku,
        before: publicPriceOf(this.beforeTtcCents),
      },
    };
  }
}

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
