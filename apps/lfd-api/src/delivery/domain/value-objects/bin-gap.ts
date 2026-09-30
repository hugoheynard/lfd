import { InvalidBinGapError } from "../errors/delivery-floor-errors.js";

/**
 * Bornes du **jeu entre bacs**, en centimètres (G-D2). Zéro est permis — des
 * bacs qu'on fait glisser —, dix suffit à tout ce qu'on sort à la main.
 */
export const BIN_GAP_MIN_CM = 0;
export const BIN_GAP_MAX_CM = 10;
/** Le défaut du plan : un bac serré contre son voisin ne se sort pas. */
export const BIN_GAP_DEFAULT_CM = 1;

/** @throws {InvalidBinGapError} un jeu non entier ou hors 0–10 cm. */
export function binGapCm(value: number): number {
  if (!Number.isInteger(value) || value < BIN_GAP_MIN_CM || value > BIN_GAP_MAX_CM) {
    throw new InvalidBinGapError(value, BIN_GAP_MIN_CM, BIN_GAP_MAX_CM);
  }
  return value;
}
