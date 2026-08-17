import {
  CATALOG_CATEGORY_LABELS,
  CATALOG_CATEGORY_ORDER,
  type CatalogCategory,
  type PriceOverlapView,
  type PriceRuleView,
  type PricingBoardView,
  type PricingCategoryView,
  type PricingLadderBandView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { BoardElasticityService } from "../application/board-elasticity.service.js";
import {
  ProductCatalogReader,
  type CatalogItem,
} from "../../orders/domain/ports/product-catalog.reader.js";
import { lineageSegments } from "../domain/lineage-overlaps.js";
import { type OverlapSegment } from "../domain/rule-overlaps.js";
import { referenceCanonicalFor } from "../application/floor-reference.js";
import { VolumeLadderReader } from "../domain/ports/volume-ladder.reader.js";
import type { VolumeLadder } from "../domain/volume-ladder.js";
import { pricingContextFor } from "../application/pricing-context.js";
import { PricingBoardReader } from "../application/ports/pricing-board.reader.js";
import {
  boardMaterials,
  itemView,
  type BoardMaterials,
  type LoadedFloor,
  type LoadedRule,
} from "../application/board-item.js";
import { type PriceRule, type PriceScope } from "../domain/price-rule.js";
import { unarchivedAt } from "./archived-at.js";
import { floorFromRow, floorViewFromRow, ruleFromRow, ruleViewFromRow } from "./price-rows.js";

/** Au-delà, ce n'est plus une mémoire consultable, c'est un export. */
const ARCHIVED_PAGE = 100;

/** Tout ce qu'une lecture ramène, avant que le tableau ne se monte. */
interface LoadedBoard {
  readonly rules: readonly LoadedRule[];
  readonly floors: readonly LoadedFloor[];
  readonly ladders: readonly VolumeLadder[];
  readonly articles: readonly CatalogItem[];
}

/**
 * **L'écran de tarification**, monté en une lecture.
 *
 * Deux décisions y sont visibles, et ce sont elles qui rendent l'écran fiable.
 *
 * **Il lit `ProductCatalogReader`**, l'autorité de prix du checkout, et non la
 * table `catalog_items` du PIM. Les deux ne s'accordent pas encore (c'est
 * exactement ce que règle la bascule C5b) : une famille y porte un code de rayon
 * ici, un identifiant PIM là-bas. Un écran de tarification bâti sur l'autre
 * catalogue afficherait des prix résolus contre un référentiel que la caisse
 * n'utilise pas — donc un simulateur d'un système qu'on ne fait pas tourner. Le
 * jour de la bascule, ce port change de source et cet écran suit sans rien
 * changer ici.
 *
 * **Le calcul, lui, n'est plus ici** : la résolution d'un article vit dans
 * `application/board-item.ts`, et cet adaptateur ne fait que ce qu'un adaptateur
 * doit faire — lire des lignes, les convertir, appeler la composition. Le
 * mélanger au calcul donnait un fichier qui changeait pour deux raisons, dont
 * une seule tenait à Postgres.
 */
@Injectable()
export class PrismaPricingBoardReader extends PricingBoardReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: ProductCatalogReader,
    private readonly elasticity: BoardElasticityService,
    private readonly ladders: VolumeLadderReader,
  ) {
    super();
  }

  async archivedRules(): Promise<PriceRuleView[]> {
    const rows = await this.prisma.priceRule.findMany({
      where: { archivedAt: { not: null } },
      orderBy: { archivedAt: "desc" },
      take: ARCHIVED_PAGE,
    });
    return rows.map(ruleViewFromRow);
  }

  async read(instant?: Date): Promise<PricingBoardView> {
    // Pris une fois : l'âge d'une limite et la résolution des prix doivent
    // parler du même instant. Le défaut est maintenant ; une date donnée rend
    // l'écran tel qu'il était.
    const at = instant ?? new Date();
    return this.assemble(await this.load(at), at);
  }

  /**
   * Le même tableau, plus la mesure des ventes.
   *
   * La mesure vient **après** la résolution, en une passe groupée : elle a besoin
   * de savoir quels articles ont bougé, et de combien. Et elle est réservée à
   * l'écran — la comparaison de deux marqueurs lit deux tableaux dont elle ne
   * veut que les prix, et l'enrichir lui ferait payer quatre requêtes de ventes
   * qu'elle jetterait aussitôt.
   *
   * Les dates d'entrée en vigueur viennent des règles **chargées** et non de la
   * vue : la vue ne liste que les portées catalogue et famille, et un article
   * dont le prix bouge par une règle de portée produit y serait invisible — donc
   * mesuré sans point de coupure, donc muet.
   */
  async readForScreen(instant?: Date): Promise<PricingBoardView> {
    const at = instant ?? new Date();
    const loaded = await this.load(at);
    const ruleDates = new Map(loaded.rules.map((entry) => [entry.rule.id, entry.rule.validFrom]));
    return this.elasticity.enrich(this.assemble(loaded, at), ruleDates, at);
  }

  private async load(at: Date): Promise<LoadedBoard> {
    // **Les archivées n'entrent pas dans le tableau** : ranger sert précisément
    // à ne plus les voir. « Archivée » se lit à l'instant demandé — cf.
    // `unarchivedAt`, qui porte le pourquoi.
    const [ruleRows, floorRows, ladders] = await Promise.all([
      this.prisma.priceRule.findMany({
        where: unarchivedAt(at),
        orderBy: [{ stage: "asc" }, { validFrom: "asc" }],
      }),
      this.prisma.priceFloor.findMany({ where: unarchivedAt(at) }),
      this.ladders.listAll(at),
    ]);

    const rules: LoadedRule[] = ruleRows.map((row) => ({
      rule: ruleFromRow(row),
      view: ruleViewFromRow(row),
    }));
    // Le tarif représentatif d'AUJOURD'HUI, par portée : c'est lui qui, comparé
    // à celui figé à la pose, dit si l'intention a vieilli.
    const articles = this.catalog.all();
    const floors: LoadedFloor[] = floorRows.map((row) => {
      const floor = floorFromRow(row);
      return {
        floor,
        view: floorViewFromRow(row, referenceCanonicalFor(floor.scope, articles), at),
      };
    });

    return { rules, floors, ladders, articles };
  }

  private assemble(loaded: LoadedBoard, at: Date): PricingBoardView {
    const materials = boardMaterials(loaded.rules, loaded.floors);
    // Groupé UNE fois : filtrer le catalogue entier par famille rendait le coût
    // proportionnel au produit familles × articles, pour un découpage qui ne
    // change jamais d'une famille à l'autre.
    const byCategory = groupByCategory(loaded.articles);

    // Les recouvrements se calculent sur les règles qui AGISSENT : une règle
    // suspendue ne recouvre rien, et l'annoncer ferait chercher un cumul qui
    // n'existe pas. (Les archivées ne sont même pas lues.)
    const catalogue = {
      rules: loaded.rules
        .filter(
          (entry) => entry.rule.scope.type === "global" && actsAt(entry.rule.suspendedFrom, at),
        )
        .map((entry) => entry.rule),
      ladders: loaded.ladders.filter((ladder) => ladder.scope.type === "global"),
    };

    return {
      categories: CATALOG_CATEGORY_ORDER.map((category) =>
        this.categoryView(
          category,
          byCategory.get(category) ?? [],
          loaded,
          materials,
          catalogue,
          at,
        ),
      ).filter((view) => view.items.length > 0),
      globalFloor: loaded.floors.find((entry) => entry.floor.scope.type === "global")?.view ?? null,
      globalRules: loaded.rules
        .filter((entry) => entry.rule.scope.type === "global")
        .map((entry) => entry.view),
      simulation: { quantity: 1, at: at.toISOString(), audience: "all" },
    };
  }

  private categoryView(
    category: CatalogCategory,
    articles: readonly CatalogItem[],
    loaded: {
      rules: readonly LoadedRule[];
      floors: readonly LoadedFloor[];
      ladders: readonly VolumeLadder[];
    },
    materials: BoardMaterials,
    catalogue: { rules: readonly PriceRule[]; ladders: readonly VolumeLadder[] },
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
          ...ownRules
            .filter((entry) => entry.rule.suspendedFrom === null)
            .map((entry) => entry.rule),
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
}

/**
 * La décision **agit-elle** à cet instant ?
 *
 * Comparé à l'instant de lecture et non au présent : une promotion suspendue le
 * 12 agissait encore le 10, et une frise du 10 qui l'omettrait raconterait une
 * autre histoire que celle qu'ont vécue les commandes de ce jour-là.
 */
function actsAt(suspendedFrom: Date | null, at: Date): boolean {
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
function groupByCategory(
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
