import type { OrderSaleUnit, ShopItemView } from '@lfd/contracts';
import { lineTotalCents, saleQuantity, weightLabel, type SaleQuantity } from '@lfd/money';

/**
 * **L'unité de vente d'un article, telle que la boutique la manie** (plan
 * `documentation/pricing/plan-vente-au-poids.md`, P4).
 *
 * Le panier retient un entier par référence, comme toujours : des PIÈCES pour
 * un article à la pièce, des GRAMMES pour un article au poids. L'unité ne se
 * stocke pas — elle se lit à l'article, que le catalogue sert (`saleUnit`,
 * `weightStepGrams`, `weightMinGrams`). Le serveur reste juge : une quantité
 * hors du pas ou sous le minimum y est refusée, jamais corrigée ici en silence.
 */

/** Ce qu'il faut de l'article pour savoir comment il se compte. */
export type SaleTerms = Pick<ShopItemView, 'saleUnit' | 'weightStepGrams' | 'weightMinGrams'>;

/** L'unité de l'article — absente du fil, c'est une pièce (une boutique d'avant P4). */
export function saleUnitOf(item: SaleTerms): OrderSaleUnit {
  return item.saleUnit ?? 'piece';
}

export function isSoldByWeight(item: SaleTerms): boolean {
  return saleUnitOf(item) === 'weight';
}

/**
 * Le pas d'un geste : une pièce, ou le pas de l'article au poids.
 *
 * `null` = un article au poids sans pas — le serveur refuse toute quantité
 * (`orders.line.weight_without_step`) : aucun geste ne l'ajoute, plutôt qu'un
 * pas inventé.
 */
export function stepOf(item: SaleTerms): number | null {
  if (!isSoldByWeight(item)) {
    return 1;
  }
  const step = item.weightStepGrams ?? null;
  return step !== null && step > 0 ? step : null;
}

/**
 * La plus petite quantité qu'on peut prendre : une pièce ; au poids, le premier
 * multiple du pas qui atteint le minimum (le pas lui-même sans minimum).
 */
export function firstQuantityOf(item: SaleTerms): number | null {
  const step = stepOf(item);
  if (step === null || !isSoldByWeight(item)) {
    return step;
  }
  const minimum = Math.max(item.weightMinGrams ?? 0, step);
  return Math.ceil(minimum / step) * step;
}

/** La quantité après un « + » : la première si rien n'est pris, sinon un pas de plus. */
export function nextQuantity(item: SaleTerms, current: number): number {
  const first = firstQuantityOf(item);
  const step = stepOf(item);
  if (first === null || step === null) {
    return current;
  }
  return current < first ? first : current + step;
}

/** La quantité après un « − » : un pas de moins, et zéro sous la première. */
export function previousQuantity(item: SaleTerms, current: number): number {
  const first = firstQuantityOf(item);
  const step = stepOf(item);
  if (first === null || step === null) {
    return Math.max(current - 1, 0);
  }
  const next = current - step;
  return next < first ? 0 : next;
}

/** La quantité dite : « 3 » pièces, ou « 500 g » / « 1,25 kg ». */
export function quantityLabel(quantity: number, unit: OrderSaleUnit | undefined): string {
  return unit === 'weight' ? weightLabel(quantity) : String(quantity);
}

/** La quantité d'une ligne, avec son unité — le seul argument d'un calcul de ligne. */
export function lineQuantityOf(quantity: number, unit: OrderSaleUnit | undefined): SaleQuantity {
  return saleQuantity(quantity, unit ?? 'piece');
}

/** Le total d'une ligne : `prix × pièces`, ou `prix au kilo × grammes / 1000`. */
export function lineTotalOf(
  unitMillicents: number,
  quantity: number,
  unit: OrderSaleUnit | undefined,
): number {
  return lineTotalCents(unitMillicents, lineQuantityOf(quantity, unit));
}

/**
 * La ligne telle qu'elle part au devis et à la passation : `saleUnit` n'est
 * écrit que pour le poids — absent, le serveur lit une pièce, ce que disaient
 * toutes les lignes d'avant.
 */
export function requestedLine(
  sku: string,
  quantity: number,
  item: SaleTerms,
): { readonly sku: string; readonly quantity: number; readonly saleUnit?: 'weight' } {
  return isSoldByWeight(item) ? { sku, quantity, saleUnit: 'weight' } : { sku, quantity };
}
