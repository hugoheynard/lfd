import { InvalidBinDimensionsError } from "../errors/delivery-bin-errors.js";

/**
 * Bornes d'une dimension de bac CANDIDAT ou de format essayé, en centimètres
 * (L4b-C1). Un TYPE de bac se mesure au millimètre (`bin-type-dimensions.ts`).
 */
export const BIN_DIMENSION_MIN_CM = 1;
export const BIN_DIMENSION_MAX_CM = 300;

/** Centimètres cubes dans un litre. */
const CM3_PER_LITER = 1000;

/** Ce que la saisie dit de trois dimensions. */
export interface BinDimensionsInput {
  readonly lengthCm: number;
  readonly widthCm: number;
  readonly heightCm: number;
}

/**
 * **Trois dimensions d'un bac candidat ou d'un format de l'assistant d'achat**,
 * en centimètres entiers. Le volume en litres
 * en est DÉRIVÉ, jamais saisi ni stocké.
 */
export class BinDimensions implements BinDimensionsInput {
  private constructor(
    readonly lengthCm: number,
    readonly widthCm: number,
    readonly heightCm: number,
  ) {}

  /**
   * @param side « extérieures » ou « intérieures » — nommé dans le refus.
   * @throws {InvalidBinDimensionsError} une dimension non entière ou hors 1–300 cm.
   */
  static of(side: string, input: BinDimensionsInput): BinDimensions {
    return new BinDimensions(
      dimension(side, "la longueur", input.lengthCm),
      dimension(side, "la largeur", input.widthCm),
      dimension(side, "la hauteur", input.heightCm),
    );
  }

  /** Litres, arrondis à l'inférieur : un litre qu'on n'a pas ne se promet pas. */
  get volumeLiters(): number {
    return Math.floor((this.lengthCm * this.widthCm * this.heightCm) / CM3_PER_LITER);
  }

  toInput(): BinDimensionsInput {
    return { lengthCm: this.lengthCm, widthCm: this.widthCm, heightCm: this.heightCm };
  }
}

function dimension(side: string, label: string, value: number): number {
  if (!Number.isInteger(value) || value < BIN_DIMENSION_MIN_CM || value > BIN_DIMENSION_MAX_CM) {
    throw new InvalidBinDimensionsError(
      side,
      `${label} vaut ${value} cm`,
      `Chaque dimension est un nombre entier de centimètres, de ${BIN_DIMENSION_MIN_CM} à ${BIN_DIMENSION_MAX_CM}.`,
    );
  }
  return value;
}
