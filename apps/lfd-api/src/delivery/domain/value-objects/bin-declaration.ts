import type { BinType } from "../entities/bin-type.js";
import {
  BinTypeArchivedForDeclarationError,
  BinTypeNotDivisibleError,
  InvalidBinDeclarationCountError,
  InvalidInnerBagsError,
} from "../errors/delivery-bin-declaration-errors.js";

/** Au plus tant de bacs ENTIERS par déclaration — la borne du contrat, tenue ici. */
export const MAX_WHOLE_BINS_PER_DECLARATION = 20;
/** Au plus tant de sacs posés dans un bac. */
export const MAX_INNER_BAGS = 50;

/** Le côté d'une moitié de bac cloisonné. */
export type BinHalf = "left" | "right";

/** Le côté opposé : l'autre moitié du même bac physique. */
export function otherHalf(half: BinHalf): BinHalf {
  return half === "left" ? "right" : "left";
}

/**
 * Les sacs posés dans un bac : un entier de 0 à {@link MAX_INNER_BAGS}.
 * @throws {InvalidInnerBagsError}
 */
export function innerBagsOf(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_INNER_BAGS) {
    throw new InvalidInnerBagsError(MAX_INNER_BAGS);
  }
  return value;
}

/**
 * Un type de bac qu'on peut DÉCLARER : en service (v2-7), et cloisonnable si
 * c'est pour une moitié.
 *
 * @throws {BinTypeArchivedForDeclarationError} @throws {BinTypeNotDivisibleError}
 */
export function ensureDeclarable(binType: BinType, forHalf: boolean): void {
  if (!binType.inService) {
    throw new BinTypeArchivedForDeclarationError(binType.name);
  }
  if (forHalf && !binType.divisible) {
    throw new BinTypeNotDivisibleError(binType.name);
  }
}

/**
 * **Ce qu'une déclaration demande** (lot 4 bis, tranche B) : `whole` bacs
 * entiers d'UN type, et au besoin une moitié — la gauche d'un bac physique
 * neuf, dont la droite reste libre. Validée ENTIÈRE avant qu'aucun code ne se
 * tire : un refus ne consomme rien.
 */
export class BinDeclaration {
  private constructor(
    readonly binType: BinType,
    readonly whole: number,
    readonly half: boolean,
    readonly innerBags: number,
  ) {}

  /**
   * @throws {InvalidBinDeclarationCountError} @throws {InvalidInnerBagsError}
   * @throws {BinTypeArchivedForDeclarationError} @throws {BinTypeNotDivisibleError}
   */
  static of(input: {
    readonly binType: BinType;
    readonly whole: number;
    readonly half: boolean;
    readonly innerBags: number;
  }): BinDeclaration {
    const { whole, half } = input;
    if (
      !Number.isInteger(whole) ||
      whole < 0 ||
      whole > MAX_WHOLE_BINS_PER_DECLARATION ||
      whole + (half ? 1 : 0) < 1
    ) {
      throw new InvalidBinDeclarationCountError(MAX_WHOLE_BINS_PER_DECLARATION);
    }
    const innerBags = innerBagsOf(input.innerBags);
    ensureDeclarable(input.binType, half);
    return new BinDeclaration(input.binType, whole, half, innerBags);
  }

  /** Le nombre de bacs scannables créés — une moitié compte pour un. */
  get count(): number {
    return this.whole + (this.half ? 1 : 0);
  }
}
