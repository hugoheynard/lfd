import { InvalidMinQuantityError } from "../errors/min-quantity-errors.js";

/**
 * Les deux clientèles d'un minimum : à qui la fiche vend
 * (`documentation/catalogue/plan-quantite-minimale.md`, Q2). `both` n'en est
 * pas une — une fiche « les deux » règle chacune de ses deux clientèles.
 */
export type MinQuantityAudience = "pro" | "public";

export const MIN_QUANTITY_AUDIENCES: readonly MinQuantityAudience[] = ["pro", "public"];

/** Le plus petit minimum qui dise quelque chose : 1 est l'absence de minimum (Q3). */
export const MIN_QUANTITY_FLOOR = 2;

/**
 * **La quantité minimale d'achat d'une déclinaison**, en pièces, par AUDIENCE
 * seulement : un minimum pro, un minimum public.
 *
 * 🔴 Pas de contexte de vente (Hugo, 2026-10-29) : le catalogue ne sait pas
 * distinguer d'office, côté particuliers, à emporter et sur place. `null` =
 * pas de minimum pour cette clientèle.
 */
export interface MinQuantities {
  readonly pro: number | null;
  readonly public: number | null;
}

/** Ce que naît toute déclinaison, et ce qu'est tout l'existant : aucun minimum. */
export const NO_MIN_QUANTITIES: MinQuantities = { pro: null, public: null };

/**
 * Lit une paire de minimums — valide ou rien : des entiers ≥
 * {@link MIN_QUANTITY_FLOOR}, ou `null`.
 *
 * @throws {InvalidMinQuantityError} un minimum n'est pas un entier ≥ 2.
 */
export function minQuantities(input: MinQuantities): MinQuantities {
  return { pro: quantityOf("pro", input.pro), public: quantityOf("public", input.public) };
}

function quantityOf(audience: MinQuantityAudience, quantity: number | null): number | null {
  if (quantity !== null && (!Number.isSafeInteger(quantity) || quantity < MIN_QUANTITY_FLOOR)) {
    throw new InvalidMinQuantityError(audience, quantity);
  }
  return quantity;
}

/** Deux paires disent-elles la même chose ? */
export function sameMinQuantities(left: MinQuantities, right: MinQuantities): boolean {
  return left.pro === right.pro && left.public === right.public;
}

/** Une paire vide ne règle rien. */
export function isEmptyMinQuantities(pair: MinQuantities): boolean {
  return pair.pro === null && pair.public === null;
}
