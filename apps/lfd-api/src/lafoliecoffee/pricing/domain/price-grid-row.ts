import {
  chainBasketDiscounts,
  lineTotalCents,
  saleQuantity,
  ttcCentsFromHtMillicents,
} from "@lfd/money";
import type { CartAdjustment, PriceGridBasketPart } from "@lfd/contracts";

import type { AdmittedPromotion } from "../../promotions/domain/live-promotion.js";
import {
  chooseBasketPromotion,
  outcomeOf,
  type BasketLine,
  type LineSealing,
} from "../../orders/domain/services/basket-promotion-choice.js";
import { exactLineTtcsOf } from "../../orders/domain/services/exact-order-composition.js";
import type { OrderLineClassification } from "../../orders/domain/ports/order-line-classification.reader.js";
import type { CatalogSaleUnit } from "../../catalog/domain/catalog-sale-unit.js";

/**
 * **Une ligne de la grille de prix** — pure (`export-grille-de-prix.md`, § 3).
 *
 * Elle ne calcule AUCUN prix : le prix affiché vient de la porte du prix, et
 * les remises au panier passent par la règle même de la caisse —
 * `outcomeOf` pour « cet article est-il concerné ? », `chooseBasketPromotion`
 * pour « lesquelles s'appliquent ensemble ? », `chainBasketDiscounts` pour le
 * montant, au chemin de la commande (HT d'un pro, TTC d'un particulier).
 * Ce qui reste ici est de la mise en cellule.
 */

/** L'assiette de la grille : HT pour un pro, TTC pour un particulier (§ 1). */
export type PriceGridBasis = "ht" | "ttc";

/** Un article tarifé, tel que la grille le reçoit. */
export interface PriceGridArticle {
  readonly sku: string;
  readonly familyName: string;
  /** Le nom de la fiche ; `null` = non reçu du référentiel, cellule vide. */
  readonly productName: string | null;
  readonly variantName: string;
  readonly saleUnit: CatalogSaleUnit;
  readonly vatRate: number;
  /** Le tarif d'entrée, HT, en millicentimes — au kilo pour un article au poids. */
  readonly baseMillicents: number;
  /** Le prix rendu par la porte, HT, en millicentimes. */
  readonly displayedMillicents: number;
  /** La mercuriale qui fixe ce prix, et ce qu'elle laisse passer. */
  readonly sealing: LineSealing | null;
  /** Les prix au kilo SAISIS — informatifs, jamais appliqués. */
  readonly enteredPerKg: {
    readonly proHtMillicents: number | null;
    readonly publicTtcCents: number | null;
  };
}

/** Une remise au panier retenue, et ce qu'on en fait. */
export interface RetainedBasketPromotion {
  readonly promotion: AdmittedPromotion;
  readonly part: Exclude<PriceGridBasketPart, "ignored">;
}

/** La cellule d'une remise en colonne : son ajustement, ou `null` (article non concerné). */
export type PriceGridColumnCell = CartAdjustment | null;

export interface PriceGridRow {
  readonly sku: string;
  readonly familyName: string;
  readonly productName: string | null;
  readonly variantName: string;
  readonly saleUnit: CatalogSaleUnit;
  /** Centimes, dans l'assiette de la grille, à l'unité de vente (pièce ou kilo). */
  readonly baseCents: number;
  readonly displayedCents: number;
  /** Une cellule par remise « colonne à part », dans l'ordre des colonnes. */
  readonly columns: readonly PriceGridColumnCell[];
  readonly netCents: number;
  /** Le prix au kilo saisi, en centimes de l'assiette ; `null` = non saisi. */
  readonly enteredPerKgCents: number | null;
}

/** Un kilo, en grammes : l'unité d'un article au poids. */
const ONE_KILOGRAM = 1_000;

/** Une unité de vente : une pièce, ou un kilo. */
function oneUnitOf(saleUnit: CatalogSaleUnit): number {
  return saleUnit === "weight" ? ONE_KILOGRAM : 1;
}

/** Lequel des deux prix d'un article. */
type PriceOf = "base" | "displayed";

/** Un prix de l'article, en centimes de l'assiette, pour une unité de vente. */
export function unitCentsOf(
  article: PriceGridArticle,
  price: PriceOf,
  basis: PriceGridBasis,
): number {
  const millicents = price === "base" ? article.baseMillicents : article.displayedMillicents;
  // TTC : la valeur saisie, celle que le rayon d'un particulier affiche ;
  // HT : le total d'une unité, arrondi une fois — celui de la ligne de commande.
  return basis === "ttc"
    ? ttcCentsFromHtMillicents(millicents, article.vatRate)
    : lineTotalCents(millicents, saleQuantity(oneUnitOf(article.saleUnit), article.saleUnit));
}

/** Le TTC d'une ligne d'une unité, composé comme la commande d'un particulier (`exact_ht`). */
function exactUnitTtcOf(article: PriceGridArticle): number {
  const [ttc] = exactLineTtcsOf([
    {
      unitPriceMillicents: article.displayedMillicents,
      quantity: oneUnitOf(article.saleUnit),
      saleUnit: article.saleUnit,
      vatRate: article.vatRate,
    },
  ]);
  return ttc ?? 0;
}

/** La ligne de panier d'UNE unité de cet article, au prix affiché — comme la caisse la chiffre. */
function basketLineOf(article: PriceGridArticle, basis: PriceGridBasis): BasketLine {
  const quantity = oneUnitOf(article.saleUnit);
  const htCents = lineTotalCents(
    article.displayedMillicents,
    saleQuantity(quantity, article.saleUnit),
  );
  const exact =
    basis === "ttc"
      ? {
          ttcCents: exactUnitTtcOf(article),
          vatRate: article.vatRate,
        }
      : undefined;
  // La quantité d'une ligne d'un kilo, en grammes au poids — celle que la caisse
  // passerait à `min_quantity`.
  return { sku: article.sku, htCents, quantity, sealing: article.sealing, exact };
}

/** Ce que les remises « prix net estimé » retirent de cette unité, par la chaîne de la caisse. */
function netDiscountCents(
  line: BasketLine,
  promotions: readonly AdmittedPromotion[],
  classifications: ReadonlyMap<string, OrderLineClassification>,
  basis: PriceGridBasis,
): number {
  if (promotions.length === 0) {
    return 0;
  }
  const outcome = chooseBasketPromotion(promotions, [line], classifications);
  if (outcome.applied.length === 0) {
    return 0;
  }
  const chain = chainBasketDiscounts(
    [
      basis === "ttc" && line.exact !== undefined
        ? { amountCents: line.exact.ttcCents, vatRate: line.exact.vatRate }
        : { amountCents: line.htCents, vatRate: 0 },
    ],
    outcome.applied.map((step) => ({
      adjustment: step.adjustment,
      coveredLines: step.ineligibleSkus.has(line.sku) ? [] : [0],
    })),
    basis === "ttc" ? "exact_ht" : "line_ht",
  );
  return chain.steps.reduce((sum, step) => sum + step.amountCents, 0);
}

/** La cellule d'une remise en colonne : son ajustement si l'article est concerné. */
function columnCellOf(
  promotion: AdmittedPromotion,
  line: BasketLine,
  classifications: ReadonlyMap<string, OrderLineClassification>,
): PriceGridColumnCell {
  const outcome = outcomeOf(promotion, [line], classifications);
  return outcome.ineligibleSkus.has(line.sku) ? null : outcome.discountAdjustment;
}

/** Le prix au kilo saisi, dans l'assiette de la grille. */
function enteredPerKgCentsOf(article: PriceGridArticle, basis: PriceGridBasis): number | null {
  if (basis === "ttc") {
    return article.enteredPerKg.publicTtcCents;
  }
  const pro = article.enteredPerKg.proHtMillicents;
  return pro === null ? null : lineTotalCents(pro, saleQuantity(1, "piece"));
}

/**
 * **La ligne d'un article.** `retained` dans l'ordre des colonnes ; seules
 * les remises « colonne à part » y prennent une cellule.
 */
export function priceGridRowOf(
  article: PriceGridArticle,
  retained: readonly RetainedBasketPromotion[],
  classifications: ReadonlyMap<string, OrderLineClassification>,
  basis: PriceGridBasis,
): PriceGridRow {
  const line = basketLineOf(article, basis);
  const displayedCents = unitCentsOf(article, "displayed", basis);
  const net = retained.filter((entry) => entry.part === "net").map((entry) => entry.promotion);
  return {
    sku: article.sku,
    familyName: article.familyName,
    productName: article.productName,
    variantName: article.variantName,
    saleUnit: article.saleUnit,
    baseCents: unitCentsOf(article, "base", basis),
    displayedCents,
    columns: retained
      .filter((entry) => entry.part === "column")
      .map((entry) => columnCellOf(entry.promotion, line, classifications)),
    netCents: displayedCents - netDiscountCents(line, net, classifications, basis),
    enteredPerKgCents: enteredPerKgCentsOf(article, basis),
  };
}
