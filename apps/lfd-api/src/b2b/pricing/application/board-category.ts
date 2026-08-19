import {
  CATALOG_CATEGORY_LABELS,
  type CatalogCategory,
  type PriceOverlapView,
  type PricingCategoryView,
  type PricingLadderBandView,
} from "@lfd/contracts";

import { lineageSegments } from "../domain/lineage-overlaps.js";
import { pricingContextFor } from "./pricing-context.js";
import { itemView, type BoardMaterials, type LoadedFloor, type LoadedRule } from "./board-item.js";
import type { CatalogItem } from "../../orders/domain/ports/product-catalog.reader.js";
import type { OverlapSegment } from "../domain/rule-overlaps.js";
import type { PriceRule, PriceScope } from "../domain/price-rule.js";
import type { VolumeLadder } from "../domain/volume-ladder.js";

/** Ce qui est posé sur TOUT le catalogue, et qui redescend donc sur chaque famille. */
export interface CatalogueLevel {
  readonly rules: readonly PriceRule[];
  readonly ladders: readonly VolumeLadder[];
}

/** Les décisions chargées, sous leurs deux formes. */
export interface LoadedDecisions {
  readonly rules: readonly LoadedRule[];
  readonly floors: readonly LoadedFloor[];
  readonly ladders: readonly VolumeLadder[];
}

/**
 * **Une famille du tableau** : son taux, sa limite, ses règles, ses croisements,
 * ses barèmes, et ses articles résolus.
 *
 * Ici et non dans l'adaptateur : rien de ce qui suit ne tient à Postgres. Le
 * jour où le catalogue vient d'ailleurs — c'est la bascule C5b — ce fichier ne
 * bouge pas.
 */
export function categoryView(
  category: CatalogCategory,
  articles: readonly CatalogItem[],
  loaded: LoadedDecisions,
  materials: BoardMaterials,
  catalogue: CatalogueLevel,
  at: Date,
): PricingCategoryView {
  const ownRules = loaded.rules.filter((entry) => targetsCategory(entry.rule.scope, category));
  // La lignée, barèmes compris : un barème compose avec toute promotion en
  // cours, et la frise se lirait « rien d'autre ne joue » sans lui.
  const lineageLadders = [
    ...catalogue.ladders,
    ...loaded.ladders.filter((ladder) => targetsCategory(ladder.scope, category)),
  ];
  return {
    id: category,
    name: CATALOG_CATEGORY_LABELS[category],
    // Le taux vient du catalogue, où il est **par produit**. Une famille qui
    // en mélangerait deux n'en annonce aucun plutôt que le premier venu.
    vatRatePercent: uniformVatRate(articles.map((item) => item.vatRate)),
    floor:
      loaded.floors.find((entry) => targetsCategory(entry.floor.scope, category))?.view ?? null,
    rules: ownRules.map((entry) => entry.view),
    // La LIGNÉE, catalogue puis famille : c'est entre niveaux que le
    // recouvrement arrive, puisque deux règles de même étage et même portée ne
    // peuvent pas se recouvrir. Les suspendues sont écartées — une règle qui
    // n'agit plus n'évince personne. (Les archivées ne sont même pas lues.)
    overlaps: lineageSegments(
      [
        ...catalogue.rules,
        ...ownRules.filter((entry) => entry.rule.suspendedFrom === null).map((entry) => entry.rule),
      ],
      lineageLadders,
    ).map(overlapView),
    ladders: lineageLadders.filter((ladder) => ladder.suspendedFrom === null).map(ladderBandView),
    items: articles.map((item) =>
      itemView(
        { sku: item.sku, name: item.name, canonicalCents: item.unitPriceCents },
        pricingContextFor(item.sku, item.category, 1, { companyId: null }, at),
        materials,
        loaded,
        loaded.ladders,
      ),
    ),
  };
}

/**
 * La décision **agit-elle** à cet instant ?
 *
 * Comparé à l'instant de lecture et non au présent : une promotion suspendue le
 * 12 agissait encore le 10, et une frise du 10 qui l'omettrait raconterait une
 * autre histoire que celle qu'ont vécue les commandes de ce jour-là.
 */
export function actsAt(suspendedFrom: Date | null, at: Date): boolean {
  return suspendedFrom === null || suspendedFrom.getTime() > at.getTime();
}

/**
 * La portée vise-t-elle cette famille (et pas un article, ni tout le catalogue) ?
 *
 * Prend une `PriceScope` et non deux primitives : le type et l'identifiant vont
 * ensemble, et les séparer en `(type: string, id: string | null)` jetait l'union
 * discriminée exactement là où elle protège — l'appariement de portée.
 */
function targetsCategory(scope: PriceScope, category: CatalogCategory): boolean {
  return scope.type === "category" && scope.id === category;
}

/** Le catalogue rangé par famille, en une passe. */
export function groupByCategory(
  articles: readonly CatalogItem[],
): ReadonlyMap<CatalogCategory, CatalogItem[]> {
  const grouped = new Map<CatalogCategory, CatalogItem[]>();
  for (const article of articles) {
    const bucket = grouped.get(article.category);
    if (bucket === undefined) {
      grouped.set(article.category, [article]);
      continue;
    }
    bucket.push(article);
  }
  return grouped;
}

/**
 * Le taux de la famille, s'il y en a **un seul**.
 *
 * `null` quand la famille en mélange deux : l'écran dit alors « varie » plutôt
 * que d'annoncer celui du premier article, qui serait faux pour les autres.
 */
function uniformVatRate(rates: readonly number[]): number | null {
  const [first, ...rest] = rates;
  if (first === undefined) {
    return null;
  }
  return rest.every((rate) => rate === first) ? first : null;
}

/** Barème de domaine → barre datée. La frise ne montre pas les paliers, elle montre une période. */
function ladderBandView(ladder: VolumeLadder): PricingLadderBandView {
  return {
    id: ladder.id,
    label: ladder.label,
    validFrom: ladder.validFrom.toISOString(),
    validTo: ladder.validTo?.toISOString() ?? null,
    tierCount: ladder.tiers.length,
  };
}

/** Segment de domaine → vue de fil. Les dates traversent en ISO, comme partout. */
function overlapView(segment: OverlapSegment): PriceOverlapView {
  return {
    from: segment.from.toISOString(),
    to: segment.to?.toISOString() ?? null,
    ruleIds: segment.ruleIds,
    evictedRuleIds: segment.evictedIds,
    composedTopBp: segment.composedTopBp,
    kind: segment.kind,
    composedBp: segment.composedBp,
  };
}
