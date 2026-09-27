import { InvalidLoyaltyRatioError } from "../errors/loyalty-errors.js";

/**
 * **Le ratio de conversion** : `pointsPerStep` points valent `stepValueCents`
 * centimes **hors taxe** — la même unité que l'assiette du gain, pour qu'un
 * point coûte ce qu'il a rapporté (Hugo, 2026-09-26). Le client y gagne en
 * plus la TVA : un bon de 5 € HT baisse son total de 5,28 € à 5,5 %. Des entiers, toujours — un bon vaut `n × stepValueCents` et
 * coûte `n × pointsPerStep` (plan D5) : aucune division, donc aucun arrondi.
 */
export class LoyaltyRatio {
  private constructor(
    readonly pointsPerStep: number,
    readonly stepValueCents: number,
  ) {}

  /** @throws {InvalidLoyaltyRatioError} une valeur non entière, nulle ou négative. */
  static of(pointsPerStep: number, stepValueCents: number): LoyaltyRatio {
    if (!isPositiveInteger(pointsPerStep) || !isPositiveInteger(stepValueCents)) {
      throw new InvalidLoyaltyRatioError(pointsPerStep, stepValueCents);
    }
    return new LoyaltyRatio(pointsPerStep, stepValueCents);
  }

  /** Les points que coûtent `steps` paliers. */
  costOf(steps: number): number {
    return steps * this.pointsPerStep;
  }

  /**
   * Le plus grand nombre de paliers qu'un solde couvre — ce que l'écran du
   * client propose de convertir (plan des points, E1.1). Zéro pour un solde
   * nul ou négatif.
   */
  stepsCoveredBy(balance: number): number {
    return balance <= 0 ? 0 : Math.floor(balance / this.pointsPerStep);
  }

  /** Les centimes que valent `steps` paliers. */
  valueOf(steps: number): number {
    return steps * this.stepValueCents;
  }
}

export function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
