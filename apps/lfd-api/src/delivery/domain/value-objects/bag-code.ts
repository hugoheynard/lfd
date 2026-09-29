import { InvalidBagCodeError } from "../errors/delivery-loading-errors.js";

/**
 * **Le code court d'un sac** (plan de tournée, lot 4, L4-C20) : ce qu'on tape
 * quand le QR est illisible.
 *
 * Six caractères de l'alphabet **Crockford base 32** — sans `I`, `L`, `O`, `U`,
 * qu'on confond avec `1`, `0`, ou qu'on ne veut pas voir au milieu d'un mot.
 * 32⁶ ≈ un milliard de combinaisons ; l'unicité sur TOUS les sacs est tenue par
 * un index, et un tirage déjà pris est retiré.
 */
export const BAG_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const BAG_CODE_LENGTH = 6;

const BAG_CODE_SHAPE = /^[0-9A-HJKMNP-TV-Z]{6}$/u;

/**
 * Normalise un code tapé (espaces autour, minuscules) et le valide.
 * @throws {InvalidBagCodeError}
 */
export function bagCodeOf(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!BAG_CODE_SHAPE.test(code)) {
    throw new InvalidBagCodeError(raw);
  }
  return code;
}
