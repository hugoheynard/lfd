import {
  type PriceOverlapView,
  type PricingCategoryView,
  type PricingLadderBandView,
} from "@lfd/contracts";

import { lineageSegments } from "../domain/lineage-overlaps.js";
import { pricingContextFor } from "../domain/pricing-context.js";
import { itemView, type BoardMaterials } from "./board-item.js";
import type { LoadedFloor, LoadedRule } from "./ports/pricing-decisions.reader.js";
import type { CatalogItem } from "../../catalog/domain/ports/product-catalog.reader.js";
import {
  compareFamilies,
  familyView,
  type CatalogFamily,
} from "../../catalog/domain/catalog-family.js";
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
  family: CatalogFamily,
  articles: readonly CatalogItem[],
  loaded: LoadedDecisions,
  materials: BoardMaterials,
  catalogue: CatalogueLevel,
  at: Date,
): PricingCategoryView {
  const ownRules = loaded.rules.filter((entry) => targetsFamily(entry.rule.scope, family));
  // Les parentes redescendent sur la famille comme le catalogue : la lignée
  // de la frise est catalogue → parentes → famille.
  const parentRules = loaded.rules.filter((entry) => targetsParentOf(entry.rule.scope, family));
  // La lignée, barèmes compris : un barème compose avec toute promotion en
  // cours, et la frise se lirait « rien d'autre ne joue » sans lui.
  const lineageLadders = [
    ...catalogue.ladders,
    ...loaded.ladders.filter((ladder) => targetsLineage(ladder.scope, family)),
  ];
  return {
    id: family.id,
    name: family.name,
    family: familyView(family),
    // Le taux vient du catalogue, où il est **par produit**. Une famille qui
    // en mélangerait deux n'en annonce aucun plutôt que le premier venu.
    vatRatePercent: uniformVatRate(articles.map((item) => item.vatRate)),
    floor: loaded.floors.find((entry) => targetsFamily(entry.floor.scope, family))?.view ?? null,
    rules: ownRules.map((entry) => entry.view),
    // La LIGNÉE, catalogue puis famille : c'est entre niveaux que le
    // recouvrement arrive, puisque deux règles de même étage et même portée ne
    // peuvent pas se recouvrir. Les suspendues sont écartées — une règle qui
    // n'agit plus n'évince personne. (Les archivées ne sont même pas lues.)
    overlaps: lineageSegments(
      [
        ...catalogue.rules,
        ...[...parentRules, ...ownRules]
          .filter((entry) => entry.rule.suspendedFrom === null)
          .map((entry) => entry.rule),
      ],
      lineageLadders,
    ).map(overlapView),
    ladders: lineageLadders.filter((ladder) => ladder.suspendedFrom === null).map(ladderBandView),
    items: articles.map((item) =>
      itemView(
        // L'article scellé par le catalogue — plus de traduction ici.
        item.article,
        pricingContextFor(item.sku, item.article.categoryPath, 1, { companyId: null }, at),
        materials,
        loaded,
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
 * La portée vise-t-elle cette famille elle-même (et pas un article, ni tout le
 * catalogue, ni une parente) ?
 *
 * Prend une `PriceScope` et non deux primitives : le type et l'identifiant vont
 * ensemble, et les séparer en `(type: string, id: string | null)` jetait l'union
 * discriminée exactement là où elle protège — l'appariement de portée.
 */
function targetsFamily(scope: PriceScope, family: CatalogFamily): boolean {
  return scope.type === "category" && scope.id === family.id;
}

/** La portée vise-t-elle une PARENTE de cette famille ? */
function targetsParentOf(scope: PriceScope, family: CatalogFamily): boolean {
  return (
    scope.type === "category" &&
    scope.id !== null &&
    scope.id !== family.id &&
    family.path.includes(scope.id)
  );
}

/** La famille ou l'une de ses parentes. */
function targetsLineage(scope: PriceScope, family: CatalogFamily): boolean {
  return scope.type === "category" && scope.id !== null && family.path.includes(scope.id);
}

/** Une famille du tableau et ses articles. */
export interface FamilyShelf {
  readonly family: CatalogFamily;
  readonly articles: readonly CatalogItem[];
}

/**
 * Le catalogue rangé par famille, en une passe, **dans l'ordre du
 * référentiel** — sans les articles de famille inconnue.
 *
 * Une famille n'apparaît que si elle porte au moins un article vivant : les
 * familles orphelines du miroir (les `cat_*` jamais retirés, la projection ne
 * supprimant rien) ne naissent jamais ici, puisque les rayons naissent des
 * articles.
 */
export function groupByFamily(articles: readonly CatalogItem[]): readonly FamilyShelf[] {
  const grouped = new Map<string, { family: CatalogFamily; articles: CatalogItem[] }>();
  for (const article of articles) {
    // Famille inconnue : aucun rayon où la ranger. L'article n'est pas perdu —
    // il reste tarifé partout où on le résout — et le tableau le COMPTE
    // (`unknownFamilyCount`) plutôt que de l'inventer dans un rayon voisin.
    if (article.family === null) {
      continue;
    }
    const bucket = grouped.get(article.family.id);
    if (bucket === undefined) {
      grouped.set(article.family.id, { family: article.family, articles: [article] });
      continue;
    }
    bucket.articles.push(article);
  }
  return [...grouped.values()].sort((left, right) => compareFamilies(left.family, right.family));
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
