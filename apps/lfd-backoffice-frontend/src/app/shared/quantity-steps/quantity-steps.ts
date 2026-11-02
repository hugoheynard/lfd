import type { OrderSaleUnit } from '@lfd/contracts';

/**
 * Les pas rapides d'une case de pièces (Hugo, 2026-10-28), du plus fin au
 * plus large.
 */
export const PIECE_STEPS = [1, 10, 50, 100] as const;

/** 100 grammes : le pas le plus fin d'une case au poids. */
const HUNDRED_GRAMS = 100;
/** Une livre : le pas intermédiaire d'une case au poids. */
const HALF_KILO_GRAMS = 500;
/** Un kilo : le pas le plus large d'une case au poids. */
const ONE_KILO_GRAMS = 1000;

/**
 * Les pas rapides d'une case au poids, en GRAMMES (L2b-4, 2026-11-02) — dits
 * « 100 g », « 500 g », « 1 kg » par `saleQuantity`. Les vues de réassort ne
 * portent pas le pas de saisie de l'article (`weightStepGrams`, vérifié le
 * 2026-11-02 : absent de `ResupplyArticleView`) ; ce sont donc des pas fixes.
 */
export const WEIGHT_STEPS_GRAMS = [HUNDRED_GRAMS, HALF_KILO_GRAMS, ONE_KILO_GRAMS] as const;

const PIECE_DOWN_STEPS: readonly number[] = [...PIECE_STEPS].reverse();
const WEIGHT_DOWN_STEPS_GRAMS: readonly number[] = [...WEIGHT_STEPS_GRAMS].reverse();

/** Les pas d'ajout d'une ligne selon son unité, du plus fin au plus large. */
export function quantityStepsFor(unit: OrderSaleUnit | undefined): readonly number[] {
  return unit === 'weight' ? WEIGHT_STEPS_GRAMS : PIECE_STEPS;
}

/** Les mêmes pas, retirés : le plus large le plus loin de la case. */
export function quantityDownStepsFor(unit: OrderSaleUnit | undefined): readonly number[] {
  return unit === 'weight' ? WEIGHT_DOWN_STEPS_GRAMS : PIECE_DOWN_STEPS;
}
