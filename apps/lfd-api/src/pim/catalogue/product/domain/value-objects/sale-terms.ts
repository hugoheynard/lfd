import { InvalidSaleTermsError } from "../errors/sale-unit-errors.js";

/**
 * L'unité dans laquelle une déclinaison se vend — et donc dans laquelle se
 * compte une quantité commandée : des pièces, ou des grammes
 * (`documentation/pricing/vente-au-poids.md`, §2).
 */
export type SaleUnit = "piece" | "weight";

export const SALE_UNITS: readonly SaleUnit[] = ["piece", "weight"];

/**
 * **Comment une déclinaison se vend** : l'unité, et pour le poids le pas de
 * saisie et le minimum, en grammes.
 *
 * Les trois voyagent ensemble parce qu'ils n'ont de sens qu'ensemble : un pas
 * sans unité au poids ne serait lu par personne. Le pas peut manquer au poids
 * — il se saisit après le choix de l'unité, comme un prix — et c'est
 * l'activation qui le réclame (`WEIGHT_STEP_GAP`), pas l'enregistrement.
 */
export interface SaleTerms {
  readonly saleUnit: SaleUnit;
  /** Le minimum commandable, en grammes ; `null` = pas de minimum. */
  readonly weightMinGrams: number | null;
  /** Le pas de saisie, en grammes ; `null` = à la pièce, ou pas encore saisi. */
  readonly weightStepGrams: number | null;
}

/** Ce que naît toute déclinaison, et ce qu'est tout l'existant. */
export const PIECE_SALE_TERMS: SaleTerms = {
  saleUnit: "piece",
  weightMinGrams: null,
  weightStepGrams: null,
};

/**
 * Lit des conditions de vente — valides ou rien.
 *
 * À la pièce, le pas et le minimum sont refusés plutôt qu'effacés : une
 * saisie qui les porte dit autre chose que ce qu'elle demande, et la corriger
 * en silence cacherait la contradiction.
 */
export function saleTerms(input: SaleTerms): SaleTerms {
  if (!SALE_UNITS.includes(input.saleUnit)) {
    throw new InvalidSaleTermsError(`unité « ${String(input.saleUnit)} » inconnue.`);
  }
  if (input.saleUnit === "piece") {
    if (input.weightMinGrams !== null || input.weightStepGrams !== null) {
      throw new InvalidSaleTermsError(
        "un pas ou un minimum en grammes ne se pose que sur une déclinaison vendue au poids. " +
          "Choisissez « Vendre au poids », ou laissez ces champs vides.",
      );
    }
    return PIECE_SALE_TERMS;
  }
  return {
    saleUnit: "weight",
    weightMinGrams: positiveGramsOrNull("le minimum", input.weightMinGrams),
    weightStepGrams: positiveGramsOrNull("le pas", input.weightStepGrams),
  };
}

function positiveGramsOrNull(label: string, value: number | null): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvalidSaleTermsError(
      `${label} (${String(value)}) doit être un nombre entier de grammes, supérieur à zéro.`,
    );
  }
  return value;
}
