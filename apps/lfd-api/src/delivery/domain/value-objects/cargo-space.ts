import { InvalidCargoDimensionsError } from "../errors/delivery-errors.js";

/** Bornes d'une dimension utile, en centimètres (L2b-C1). */
export const CARGO_DIMENSION_MIN_CM = 1;
export const CARGO_DIMENSION_MAX_CM = 1000;

/** Centimètres cubes dans un litre. */
const CM3_PER_LITER = 1000;

/** Ce que la saisie dit des dimensions utiles. */
export interface CargoDimensions {
  readonly lengthCm: number;
  readonly widthCm: number;
  readonly heightCm: number;
}

/**
 * **L'espace de chargement utile** d'un véhicule — l'intérieur, en centimètres
 * entiers (lot 2 bis, L2b-C1). Le volume en litres en est DÉRIVÉ, jamais saisi
 * ni stocké : deux vérités divergeraient à la première correction.
 */
export class CargoSpace implements CargoDimensions {
  private constructor(
    readonly lengthCm: number,
    readonly widthCm: number,
    readonly heightCm: number,
  ) {}

  /** @throws {InvalidCargoDimensionsError} une dimension non entière ou hors 1–1 000 cm. */
  static of(input: CargoDimensions): CargoSpace {
    return new CargoSpace(
      dimension("la longueur", input.lengthCm),
      dimension("la largeur", input.widthCm),
      dimension("la hauteur", input.heightCm),
    );
  }

  /** Litres, arrondis à l'entier inférieur : un litre qu'on n'a pas ne se promet pas. */
  get volumeLiters(): number {
    return Math.floor((this.lengthCm * this.widthCm * this.heightCm) / CM3_PER_LITER);
  }

  toDimensions(): CargoDimensions {
    return { lengthCm: this.lengthCm, widthCm: this.widthCm, heightCm: this.heightCm };
  }
}

function dimension(label: string, value: number): number {
  if (
    !Number.isInteger(value) ||
    value < CARGO_DIMENSION_MIN_CM ||
    value > CARGO_DIMENSION_MAX_CM
  ) {
    throw new InvalidCargoDimensionsError(`${label} vaut ${value} cm`);
  }
  return value;
}
