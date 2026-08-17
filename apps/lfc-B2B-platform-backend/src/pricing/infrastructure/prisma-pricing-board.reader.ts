import {
  CATALOG_CATEGORY_LABELS,
  CATALOG_CATEGORY_ORDER,
  type CatalogCategory,
  type PriceFloorView,
  type PriceRuleView,
  type PricingBoardView,
  type PricingCategoryView,
  type PricingItemView,
  type NegotiationRoom,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { BoardElasticityService } from "../application/board-elasticity.service.js";
import { ProductCatalogReader } from "../../orders/domain/ports/product-catalog.reader.js";
import { pricingContextFor } from "../application/pricing-context.js";
import { PricingBoardReader } from "../domain/ports/pricing-board.reader.js";
import { decideFloor } from "../domain/floor-policy.js";
import { floorCentsFor, resolveScopedFloor } from "../domain/resolve-floor.js";
import { resolvePrice } from "../domain/resolve-price.js";
import { applies, winnerOf } from "../domain/specificity.js";
import {
  PRICE_STAGES,
  type PriceRule,
  type PricingContext,
  type ScopedPriceFloor,
} from "../domain/price-rule.js";
import { floorFromRow, floorViewFromRow, ruleFromRow, ruleViewFromRow } from "./price-rows.js";

/** Une règle lue une fois, sous ses deux formes : celle qui calcule, celle qui s'affiche. */
interface LoadedRule {
  readonly rule: PriceRule;
  readonly view: PriceRuleView;
}

interface LoadedFloor {
  readonly floor: ScopedPriceFloor;
  readonly view: PriceFloorView;
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
 * **Le prix vient de `resolvePrice`**, la fonction qui facture. Aucune
 * arithmétique d'affichage n'est écrite ici : un écran qui recalcule à sa façon
 * finit par annoncer autre chose que la facture, et c'est précisément ce qu'un
 * client conteste.
 */
@Injectable()
export class PrismaPricingBoardReader extends PricingBoardReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: ProductCatalogReader,
    private readonly elasticity: BoardElasticityService,
  ) {
    super();
  }

  async read(): Promise<PricingBoardView> {
    const [ruleRows, floorRows] = await Promise.all([
      this.prisma.priceRule.findMany({ orderBy: [{ stage: "asc" }, { validFrom: "asc" }] }),
      this.prisma.priceFloor.findMany(),
    ]);
    const rules: LoadedRule[] = ruleRows.map((row) => ({
      rule: ruleFromRow(row),
      view: ruleViewFromRow(row),
    }));
    const floors: LoadedFloor[] = floorRows.map((row) => ({
      floor: floorFromRow(row),
      view: floorViewFromRow(row),
    }));

    // L'instant est pris UNE fois pour tout l'écran : deux lignes résolues à
    // quelques millisecondes d'écart pourraient sinon tomber de part et d'autre
    // du basculement d'une promotion, et l'écran se contredirait lui-même.
    const at = new Date();

    const board: PricingBoardView = {
      categories: CATALOG_CATEGORY_ORDER.map((category) =>
        this.categoryView(category, rules, floors, at),
      ).filter((view) => view.items.length > 0),
      globalFloor: floors.find((entry) => entry.floor.scope.type === "global")?.view ?? null,
      globalRules: rules
        .filter((entry) => entry.rule.scope.type === "global")
        .map((entry) => entry.view),
      simulation: { quantity: 1, at: at.toISOString(), audience: "all" },
    };

    // La mesure des ventes vient APRÈS la résolution, en une passe groupée : elle
    // a besoin de savoir quels articles ont bougé, et de combien.
    return this.elasticity.enrich(
      board,
      new Map(rules.map((entry) => [entry.rule.id, entry.rule.validFrom])),
      at,
    );
  }

  private categoryView(
    category: CatalogCategory,
    rules: readonly LoadedRule[],
    floors: readonly LoadedFloor[],
    at: Date,
  ): PricingCategoryView {
    const articles = this.catalog.all().filter((item) => item.category === category);
    return {
      id: category,
      name: CATALOG_CATEGORY_LABELS[category],
      // Le taux vient du catalogue, où il est **par produit**. Une famille qui
      // en mélangerait deux n'en annonce aucun plutôt que le premier venu.
      vatRatePercent: uniformVatRate(articles.map((item) => item.vatRate)),
      floor:
        floors.find((entry) => scopeTargets(entry.floor.scope.type, entry.floor.scope.id, category))
          ?.view ?? null,
      rules: rules
        .filter((entry) => scopeTargets(entry.rule.scope.type, entry.rule.scope.id, category))
        .map((entry) => entry.view),
      items: articles.map((item) =>
        itemView(
          { sku: item.sku, name: item.name, canonicalCents: item.unitPriceCents },
          pricingContextFor(item.sku, item.category, 1, { companyId: null }, at),
          rules,
          floors,
        ),
      ),
    };
  }
}

/** La portée vise-t-elle cette famille (et pas un article, ni tout le catalogue) ? */
function scopeTargets(type: string, id: string | null, category: string): boolean {
  return type === "category" && id === category;
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

function itemView(
  article: { sku: string; name: string; canonicalCents: number },
  context: PricingContext,
  rules: readonly LoadedRule[],
  floors: readonly LoadedFloor[],
): PricingItemView {
  const winner = resolveScopedFloor(
    floors.map((entry) => entry.floor),
    context,
  );

  // La même fonction que la caisse, avec les preuves de la simulation :
  // quantité 1, aucune mesure d'historique. La porte reste donc FERMÉE, ce qui
  // est la lecture juste — l'écran montre le prix de vitrine, et le plancher
  // dynamique s'ouvre sur des conditions que la vitrine ne remplit pas.
  const decision =
    winner === null
      ? null
      : decideFloor(winner.policy, { quantity: context.quantity, observedVolumeRatioBp: null });

  const resolved = resolvePrice(
    article.canonicalCents,
    rules.map((entry) => entry.rule),
    context,
    decision?.applied ?? null,
  );

  return {
    sku: article.sku,
    name: article.name,
    canonicalCents: article.canonicalCents,
    ownFloor: floors.find((entry) => targetsArticle(entry.floor.scope, article.sku))?.view ?? null,
    effectiveFloor: floors.find((entry) => entry.floor.id === winner?.id)?.view ?? null,
    rules: rules
      .filter((entry) => targetsArticle(entry.rule.scope, article.sku))
      .map((entry) => entry.view),
    supersededRuleIds: supersededIn(rules, context),
    steps: resolved.steps.map((step) => ({ ...step })),
    floored: resolved.floored,
    finalCents: resolved.finalCents,
    negotiationRoom: negotiationRoom(
      resolved.finalCents,
      decision === null ? null : floorCentsFor(decision.applied, article.canonicalCents),
    ),
    // Posée à `null` ici, remplie par la passe de mesure : la résolution d'un
    // prix ne consulte pas l'historique des ventes, et ne doit pas commencer.
    elasticity: null,
  };
}

function targetsArticle(scope: { type: string; id: string | null }, sku: string): boolean {
  return (scope.type === "product" || scope.type === "variant") && scope.id === sku;
}

/**
 * Les règles qui **s'appliquaient** à cet article sans gagner leur étage.
 *
 * Sans ce champ, l'écran alignerait une altération de famille et une altération
 * de produit et laisserait croire qu'elles s'enchaînent — alors que la plus
 * spécifique REMPLACE l'autre à l'intérieur d'un étage. Le lecteur additionnerait
 * deux remises dont une seule a produit un effet, sans aucun moyen de s'en
 * apercevoir : les deux nombres seraient là, et le total ne collerait pas.
 */
function supersededIn(rules: readonly LoadedRule[], context: PricingContext): string[] {
  const evicted: string[] = [];
  for (const stage of PRICE_STAGES) {
    const applicable = rules
      .map((entry) => entry.rule)
      .filter((rule) => rule.stage === stage && applies(rule, context));
    if (applicable.length < 2) {
      continue;
    }
    const winner = winnerOf(applicable, context);
    evicted.push(...applicable.filter((rule) => rule.id !== winner?.id).map((rule) => rule.id));
  }
  return evicted;
}

/**
 * **Ce qu'un commercial peut encore lâcher** sans franchir la limite.
 *
 * Sans limite posée, il n'y a pas de marge définie : rendre `null` plutôt qu'un
 * nombre évite d'annoncer une latitude que personne n'a décidée. Un article déjà
 * relevé au plancher rend `0` — ce qui est une information, et pas la même.
 *
 * Bornée à zéro : un prix passé sous son plancher (donné par une mercuriale, que
 * le plancher relève ensuite) donnerait une marge négative, c'est-à-dire une
 * hausse déguisée en remise dans la colonne où on lit les remises.
 */
function negotiationRoom(finalCents: number, floorCents: number | null): NegotiationRoom | null {
  if (floorCents === null) {
    return null;
  }
  const room = Math.max(0, finalCents - floorCents);
  return {
    floorCents,
    maxDiscountCents: room,
    // En points de base du prix FINAL : c'est sur ce prix-là que le commercial
    // annonce « je te fais 5 % », pas sur le canonique que le client n'a jamais vu.
    maxDiscountBp: finalCents <= 0 ? 0 : Math.round((room / finalCents) * 10_000),
  };
}
