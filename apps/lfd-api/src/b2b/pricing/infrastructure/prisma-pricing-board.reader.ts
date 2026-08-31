import { CATALOG_CATEGORY_ORDER, type PriceRuleView, type PricingBoardView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { BoardElasticityService } from "../application/board-elasticity.service.js";
import {
  ProductCatalogReader,
  type CatalogItem,
} from "../../orders/domain/ports/product-catalog.reader.js";
import { referenceCanonicalFor } from "../application/floor-reference.js";
import { CanonicalPriceHistoryReader } from "../../catalog/domain/ports/canonical-price-history.reader.js";
import { VolumeLadderReader } from "../domain/ports/volume-ladder.reader.js";
import type { VolumeLadder } from "../domain/volume-ladder.js";
import { PricingBoardReader } from "../application/ports/pricing-board.reader.js";
import { boardMaterials, type LoadedFloor, type LoadedRule } from "../application/board-item.js";
import { actsAt, categoryView, groupByCategory } from "../application/board-category.js";
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
  /** Depuis quand le tarif est tracé — `null` si l'historique est vide. */
  readonly historyStartsAt: Date | null;
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
    private readonly history: CanonicalPriceHistoryReader,
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
    const [ruleRows, floorRows, ladders, pastPrices, historyStartsAt] = await Promise.all([
      this.prisma.priceRule.findMany({
        where: unarchivedAt(at),
        orderBy: [{ stage: "asc" }, { validFrom: "asc" }],
      }),
      this.prisma.priceFloor.findMany({ where: unarchivedAt(at) }),
      this.ladders.listAll(at),
      this.history.pricesAt(at),
      this.history.startsAt(),
    ]);

    const rules: LoadedRule[] = ruleRows.map((row) => ({
      rule: ruleFromRow(row),
      view: ruleViewFromRow(row),
    }));
    // Le tarif représentatif d'AUJOURD'HUI, par portée : c'est lui qui, comparé
    // à celui figé à la pose, dit si l'intention a vieilli.
    // **Le tarif de CE jour-là**, pas celui d'aujourd'hui.
    //
    // Sans cette surcouche, une lecture datée appliquait les décisions d'hier
    // aux tarifs d'aujourd'hui — un mélange qui a l'air d'un prix passé sans en
    // être un. Un article sans trace antérieure garde son tarif courant : c'est
    // tout ce qu'on sait de lui, et `canonicalHistoryStartsAt` dit à l'écran
    // jusqu'où il peut se fier à ce qu'il lit.
    const current = await this.catalog.all();
    const articles = current.map((item) => {
      const past = pastPrices.get(item.sku);
      return past === undefined ? item : { ...item, unitPriceMillicents: past };
    });
    const floors: LoadedFloor[] = floorRows.map((row) => {
      const floor = floorFromRow(row);
      return {
        floor,
        view: floorViewFromRow(row, referenceCanonicalFor(floor.scope, articles), at),
      };
    });

    return { rules, floors, ladders, articles, historyStartsAt };
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
        categoryView(category, byCategory.get(category) ?? [], loaded, materials, catalogue, at),
      ).filter((view) => view.items.length > 0),
      globalFloor: loaded.floors.find((entry) => entry.floor.scope.type === "global")?.view ?? null,
      globalRules: loaded.rules
        .filter((entry) => entry.rule.scope.type === "global")
        .map((entry) => entry.view),
      canonicalHistoryStartsAt: loaded.historyStartsAt?.toISOString() ?? null,
      simulation: { quantity: 1, at: at.toISOString(), audience: "all" },
    };
  }
}
