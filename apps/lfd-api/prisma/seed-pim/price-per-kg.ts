import type { CorpusProduct } from "./corpus.js";

/** Le rayon dont chaque pièce porte un prix au kilo au semis. */
const PRICED_PER_KG_CATEGORY = "Pains";

/**
 * Le poids supposé des pains que le corpus ne pèse pas — sans lui, pas de
 * prix au kilo. Une valeur de démonstration, pas une donnée du fournil.
 */
const ASSUMED_WEIGHT_GRAMS: Readonly<Record<string, number>> = {
  "PAI-001": 250,
  "PAI-005": 80,
};

const MILLICENTS_PER_EURO = 100_000;
const GRAMS_PER_KG = 1_000;

/** Ce que le semis pose en plus sur la tarification d'un pain. */
export interface SeedPricePerKg {
  readonly proPricePerKgHt?: string;
  readonly publicPricePerKgTtcCents?: number;
}

/**
 * **Le prix au kilo d'un pain du semis**, tiré de son prix et de son poids.
 *
 * En production, il est SAISI et jamais calculé (`plan-prix-au-kilo.md`) ;
 * le semis le dérive seulement pour que chaque pain de démonstration en montre
 * un sous son prix. Rien hors du rayon Pains, rien sans prix ni poids.
 */
export function seedPricePerKg(product: CorpusProduct): SeedPricePerKg {
  if (product.categoryName !== PRICED_PER_KG_CATEGORY) {
    return {};
  }
  const grams = product.weightGrams ?? ASSUMED_WEIGHT_GRAMS[product.sku] ?? null;
  if (grams === null || grams <= 0) {
    return {};
  }
  const perKg = (amount: number): number => Math.round((amount * GRAMS_PER_KG) / grams);
  const proMillicents =
    product.proPriceHt == null
      ? null
      : Math.round(Number(product.proPriceHt) * MILLICENTS_PER_EURO);
  return {
    ...(product.priceCents === null ? {} : { publicPricePerKgTtcCents: perKg(product.priceCents) }),
    ...(proMillicents === null
      ? {}
      : { proPricePerKgHt: (perKg(proMillicents) / MILLICENTS_PER_EURO).toFixed(5) }),
  };
}
