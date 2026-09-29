import { InvalidRefrigerationError } from "../errors/delivery-errors.js";

/** Bornes du volume réfrigéré, en litres (L2b-C2). */
export const REFRIGERATED_VOLUME_MIN_LITERS = 1;
export const REFRIGERATED_VOLUME_MAX_LITERS = 20_000;

/** Bornes de la plage de température, en °C (L2b-C2). */
export const REFRIGERATION_TEMP_MIN_C = -30;
export const REFRIGERATION_TEMP_MAX_C = 15;

/** Ce que la saisie dit de la caisse réfrigérée. */
export interface RefrigerationSpec {
  readonly volumeLiters: number;
  readonly minTempC: number;
  readonly maxTempC: number;
}

/**
 * **La caisse réfrigérée** d'un véhicule (lot 2 bis, L2b-C2). Un véhicule sec
 * n'en a pas : c'est l'absence, pas un volume nul.
 *
 * « Pas plus que le volume utile » n'est pas ici : la règle lie deux parties
 * du véhicule, c'est lui qui la tient.
 */
export class RefrigeratedCompartment implements RefrigerationSpec {
  private constructor(
    readonly volumeLiters: number,
    readonly minTempC: number,
    readonly maxTempC: number,
  ) {}

  /** @throws {InvalidRefrigerationError} bornes, entiers, ou minimum au-dessus du maximum. */
  static of(input: RefrigerationSpec): RefrigeratedCompartment {
    const volume = input.volumeLiters;
    if (
      !Number.isInteger(volume) ||
      volume < REFRIGERATED_VOLUME_MIN_LITERS ||
      volume > REFRIGERATED_VOLUME_MAX_LITERS
    ) {
      throw new InvalidRefrigerationError(
        `le volume réfrigéré vaut ${volume} L, il doit être un entier de ${REFRIGERATED_VOLUME_MIN_LITERS} à 20 000 L`,
      );
    }
    const min = temperature("minimale", input.minTempC);
    const max = temperature("maximale", input.maxTempC);
    if (min > max) {
      throw new InvalidRefrigerationError(
        `la température minimale (${min} °C) est au-dessus de la maximale (${max} °C)`,
      );
    }
    return new RefrigeratedCompartment(volume, min, max);
  }

  toSpec(): RefrigerationSpec {
    return { volumeLiters: this.volumeLiters, minTempC: this.minTempC, maxTempC: this.maxTempC };
  }
}

function temperature(which: string, value: number): number {
  if (
    !Number.isInteger(value) ||
    value < REFRIGERATION_TEMP_MIN_C ||
    value > REFRIGERATION_TEMP_MAX_C
  ) {
    throw new InvalidRefrigerationError(
      `la température ${which} vaut ${value} °C, elle doit être un entier de −30 à +15 °C`,
    );
  }
  return value;
}
