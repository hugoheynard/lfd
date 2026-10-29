import type { OrderSaleUnit } from '@lfd/contracts';
import { saleQuantity, weightLabel, type SaleQuantity } from '@lfd/money';

/**
 * **Comment un article se compte à la saisie** (plan
 * `documentation/pricing/vente-au-poids.md`, P5) — l'unité, et au poids
 * le pas et le minimum en grammes, tels que le catalogue serveur les sert.
 *
 * Une quantité reste un entier : des PIÈCES, ou des GRAMMES. L'unité ne se
 * stocke pas avec elle, elle se lit à l'article. Le serveur reste juge : une
 * quantité hors du pas ou sous le minimum y est refusée, jamais corrigée ici.
 */
export interface SaleTerms {
  /** Absente = `piece` : un article servi avant la vente au poids. */
  readonly saleUnit?: OrderSaleUnit | undefined;
  readonly weightStepGrams?: number | null | undefined;
  readonly weightMinGrams?: number | null | undefined;
  /**
   * Le minimum de pièces de l'article (plan
   * `documentation/catalogue/plan-quantite-minimale.md`, Q4 et Q6) — absent ou
   * `null` = pas de minimum ; sans effet au poids, qui a `weightMinGrams`.
   */
  readonly minQuantity?: number | null | undefined;
}

/** Le minimum de pièces d'un article à la pièce, ou `null` (aucun, ou au poids). */
export function pieceMinimumOf(terms: SaleTerms): number | null {
  if (saleUnitOf(terms) !== 'piece') {
    return null;
  }
  const minimum = terms.minQuantity ?? null;
  return minimum !== null && minimum > 1 ? minimum : null;
}

/** L'unité d'un article — absente du fil, c'est une pièce. */
export function saleUnitOf(terms: SaleTerms): OrderSaleUnit {
  return terms.saleUnit ?? 'piece';
}

/**
 * Le pas d'un geste : une pièce, ou le pas de l'article au poids.
 *
 * `null` = un article au poids sans pas : le serveur refuse toute quantité
 * (`orders.line.weight_without_step`), et aucun geste ne doit l'ajouter plutôt
 * qu'inventer un pas.
 */
export function saleStepOf(terms: SaleTerms): number | null {
  if (saleUnitOf(terms) === 'piece') {
    return 1;
  }
  const step = terms.weightStepGrams ?? null;
  return step !== null && step > 0 ? step : null;
}

/**
 * La plus petite quantité qu'on peut prendre : une pièce, ou le minimum de
 * pièces de l'article ; au poids, le premier multiple du pas qui atteint le
 * minimum (le pas lui-même sans minimum). `null` quand l'article au poids n'a
 * pas de pas. Le serveur refuse dessous (`orders.line.quantity_below_minimum`).
 */
export function firstSaleQuantityOf(terms: SaleTerms): number | null {
  const step = saleStepOf(terms);
  if (step === null) {
    return null;
  }
  if (saleUnitOf(terms) === 'piece') {
    return pieceMinimumOf(terms) ?? step;
  }
  const minimum = Math.max(terms.weightMinGrams ?? 0, step);
  return Math.ceil(minimum / step) * step;
}

/**
 * Le plancher d'un stepper : le premier multiple du pas qui atteint le
 * minimum, le pas lui-même sans minimum. Un minimum de 10 pièces vendues par
 * carton de 6 part de 12 (plan quantité minimale, Q6).
 */
export function floorQuantityOf(minimum: number | undefined, step: number): number {
  return Math.ceil(Math.max(minimum ?? step, step) / step) * step;
}

/** La quantité dite : « 3 » pièces, ou « 500 g » / « 1,25 kg ». */
export function saleQuantityLabel(quantity: number, unit: OrderSaleUnit | undefined): string {
  return unit === 'weight' ? weightLabel(quantity) : String(quantity);
}

/** La quantité d'une ligne avec son unité — le seul argument d'un calcul de ligne. */
export function lineSaleQuantity(quantity: number, unit: OrderSaleUnit | undefined): SaleQuantity {
  return saleQuantity(quantity, unit ?? 'piece');
}
