import { InvalidBinCapacityError } from "../errors/delivery-bin-errors.js";

/** Bornes d'une contenance (L4b-C2) — celles du contrat. */
export const BIN_CAPACITY_MIN_UNITS = 1;
export const BIN_CAPACITY_MAX_UNITS = 10_000;

/**
 * **Combien d'unités d'un produit tient un bac ENTIER** d'un type (L4b-C2,
 * v2-3 : une unité occupe `1 / units` du bac). Zéro n'est pas une contenance :
 * « ne va pas dans ce bac » est une case vide, jamais un 0 qui ferait diviser
 * par zéro le colisage.
 *
 * @throws {InvalidBinCapacityError} non entier ou hors 1–10 000.
 */
export function binCapacityUnitsOf(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < BIN_CAPACITY_MIN_UNITS ||
    value > BIN_CAPACITY_MAX_UNITS
  ) {
    throw new InvalidBinCapacityError(value, BIN_CAPACITY_MIN_UNITS, BIN_CAPACITY_MAX_UNITS);
  }
  return value;
}
