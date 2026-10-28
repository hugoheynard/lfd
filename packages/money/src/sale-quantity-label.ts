import { GRAMS_PER_KILOGRAM } from "./sale-quantity.js";

/**
 * **Un poids tel qu'on le dit au client** — plan
 * `documentation/pricing/plan-vente-au-poids.md`, § 2 (Hugo, 2026-10-28) :
 * grammes sous le kilo, kilos au-delà — « 20 g », « 500 g », « 1,25 kg »,
 * « 2 kg », jamais « 0,02 kg ». Les zéros de queue tombent ; au plus trois
 * décimales, puisque la quantité est un nombre entier de grammes.
 *
 * ⚠️ Pas pour la facture : elle dit toujours des kilos à trois décimales
 * (« 0,020 kg »), comme son XML (lot P7).
 *
 * @throws {RangeError} si `weightGrams` n'est pas un entier positif ou nul.
 */
export function weightLabel(weightGrams: number): string {
  if (!Number.isSafeInteger(weightGrams) || weightGrams < 0) {
    throw new RangeError(
      `Poids invalide : ${String(weightGrams)} grammes. Un poids de vente est un entier positif ou nul.`,
    );
  }
  if (weightGrams < GRAMS_PER_KILOGRAM) {
    return `${String(weightGrams)} g`;
  }
  const kilos = Math.floor(weightGrams / GRAMS_PER_KILOGRAM);
  const rest = weightGrams % GRAMS_PER_KILOGRAM;
  if (rest === 0) {
    return `${String(kilos)} kg`;
  }
  const decimals = String(rest).padStart(3, "0").replace(/0+$/u, "");
  return `${String(kilos)},${decimals} kg`;
}
