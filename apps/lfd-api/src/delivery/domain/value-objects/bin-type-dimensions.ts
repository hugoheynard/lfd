import { InvalidBinDimensionsError } from "../errors/delivery-bin-errors.js";

/**
 * Bornes d'une dimension de bac, en millimètres (2026-10-07) — les 1–300 cm
 * d'avant, convertis : un bac d'un centimètre reste absurde mais admis, comme
 * avant, et rien ne dépasse trois mètres.
 */
export const BIN_TYPE_DIMENSION_MIN_MM = 10;
export const BIN_TYPE_DIMENSION_MAX_MM = 3000;

/**
 * Millimètres dans un centimètre : la seule conversion côté bacs, exacte dans
 * ce sens — elle ne sert plus qu'où un bac rencontre un plancher de véhicule,
 * mesuré en cm.
 */
export const MM_PER_CM = 10;

/** Millimètres cubes dans un litre. */
const MM3_PER_LITER = 1_000_000;

/** Ce que la saisie dit de trois dimensions, en millimètres. */
export interface BinTypeDimensionsInput {
  readonly lengthMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

/**
 * **Trois dimensions d'un bac**, en millimètres entiers — une manne à pain
 * mesure 66,5 cm, et le centimètre entier ne savait pas l'écrire. Le volume en
 * litres en est DÉRIVÉ, jamais saisi ni stocké.
 *
 * La SEULE mesure de bac du bloc (2026-10-07) : un type de bac, un candidat de
 * la bibliothèque d'achat et un format de l'assistant la partagent. Le nom
 * garde « Type » parce que les règles sont celles du type de bac ; les
 * dimensions en cm entiers (`BinDimensions`) qui servaient aux deux derniers
 * sont retirées.
 */
export class BinTypeDimensions implements BinTypeDimensionsInput {
  private constructor(
    readonly lengthMm: number,
    readonly widthMm: number,
    readonly heightMm: number,
  ) {}

  /**
   * @param side « extérieures » ou « intérieures » — nommé dans le refus.
   * @throws {InvalidBinDimensionsError} une dimension non entière en mm, ou hors 1–300 cm.
   */
  static of(side: string, input: BinTypeDimensionsInput): BinTypeDimensions {
    return new BinTypeDimensions(
      dimension(side, "la longueur", input.lengthMm),
      dimension(side, "la largeur", input.widthMm),
      dimension(side, "la hauteur", input.heightMm),
    );
  }

  /** Litres, arrondis à l'inférieur : un litre qu'on n'a pas ne se promet pas. */
  get volumeLiters(): number {
    return Math.floor((this.lengthMm * this.widthMm * this.heightMm) / MM3_PER_LITER);
  }

  toInput(): BinTypeDimensionsInput {
    return { lengthMm: this.lengthMm, widthMm: this.widthMm, heightMm: this.heightMm };
  }
}

/**
 * Des millimètres écrits comme on les dit au labo : « 66,5 cm », « 46 cm ».
 * La décimale n'apparaît que si elle n'est pas nulle.
 */
export function centimetresLabel(mm: number): string {
  const whole = Math.trunc(mm / MM_PER_CM);
  const tenth = Math.abs(mm % MM_PER_CM);
  return tenth === 0 ? `${whole} cm` : `${whole},${tenth} cm`;
}

function dimension(side: string, label: string, value: number): number {
  if (
    !Number.isInteger(value) ||
    value < BIN_TYPE_DIMENSION_MIN_MM ||
    value > BIN_TYPE_DIMENSION_MAX_MM
  ) {
    throw new InvalidBinDimensionsError(
      side,
      `${label} vaut ${String(value)} mm`,
      `Chaque dimension se mesure au millimètre près, de ${centimetresLabel(BIN_TYPE_DIMENSION_MIN_MM)} à ${centimetresLabel(BIN_TYPE_DIMENSION_MAX_MM)}.`,
    );
  }
  return value;
}
