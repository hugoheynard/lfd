/**
 * **La quantité d'une ligne, avec son unité** — plan
 * `documentation/pricing/plan-vente-au-poids.md`, § 2 : « une quantité sans
 * unité ne doit plus pouvoir s'écrire ».
 *
 * Des pièces et des grammes sont tous deux des entiers. Un prix au kilo
 * multiplié par 1 250 grammes comme s'il s'agissait de pièces rendrait un
 * montant mille fois trop grand, et aucun type ne l'aurait vu. Ce value object
 * est donc le SEUL argument de quantité des calculs de ligne
 * (`lineTotalCents`, `composeTtcOrder`) : l'appelant doit dire l'unité.
 *
 * La quantité reste un entier dans l'unité de la ligne : jamais de décimale,
 * jamais de flottant — 1,25 kg s'écrit `grams(1250)`.
 */
export type SaleUnit = "piece" | "weight";

/** Le nombre de grammes dans un kilogramme : le prix d'un article au poids est au kilo. */
export const GRAMS_PER_KILOGRAM = 1_000;

export interface SaleQuantity {
  /** Des pièces si `unit = "piece"`, des grammes si `unit = "weight"`. Entier ≥ 0. */
  readonly amount: number;
  readonly unit: SaleUnit;
}

/**
 * Une quantité à la pièce.
 *
 * @throws {RangeError} si `count` n'est pas un entier positif ou nul.
 */
export function pieces(count: number): SaleQuantity {
  return { amount: wholeAmount(count, "pièces"), unit: "piece" };
}

/**
 * Une quantité au poids, en grammes.
 *
 * @throws {RangeError} si `weightGrams` n'est pas un entier positif ou nul.
 */
export function grams(weightGrams: number): SaleQuantity {
  return { amount: wholeAmount(weightGrams, "grammes"), unit: "weight" };
}

function wholeAmount(amount: number, unitLabel: string): number {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    // Tronquer en silence ferait payer une autre quantité que celle demandée.
    throw new RangeError(
      `Quantité invalide : ${String(amount)} ${unitLabel}. Une quantité de vente est un entier positif ou nul.`,
    );
  }
  return amount;
}

/**
 * Une quantité **dans l'unité d'une ligne** — le geste de tout lecteur d'une
 * ligne figée, qui porte sa quantité et son unité côte à côte.
 *
 * @throws {RangeError} si `amount` n'est pas un entier positif ou nul.
 */
export function saleQuantity(amount: number, unit: SaleUnit): SaleQuantity {
  return unit === "weight" ? grams(amount) : pieces(amount);
}
