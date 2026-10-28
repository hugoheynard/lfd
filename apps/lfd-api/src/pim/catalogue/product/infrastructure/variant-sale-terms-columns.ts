import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import type { VariantSnapshot } from "../domain/entities/variant.js";
import { SALE_UNITS, type SaleUnit } from "../domain/value-objects/sale-terms.js";

/** Les quatre colonnes de la vente au poids, telles que la ligne les porte. */
export interface SaleTermsRow {
  readonly saleUnit: string;
  readonly weightMinGrams: number | null;
  readonly weightStepGrams: number | null;
  readonly hasBeenPublished: boolean;
}

type SaleTermsFields = Pick<
  VariantSnapshot,
  "saleUnit" | "weightMinGrams" | "weightStepGrams" | "hasBeenPublished"
>;

/**
 * La ligne → le domaine. La colonne est un texte (un `CHECK` la borne) : une
 * valeur inconnue est une base corrompue, pas une saisie à refuser poliment.
 */
export function saleTermsOf(row: SaleTermsRow): SaleTermsFields {
  return {
    saleUnit: saleUnitOf(row.saleUnit),
    weightMinGrams: row.weightMinGrams,
    weightStepGrams: row.weightStepGrams,
    hasBeenPublished: row.hasBeenPublished,
  };
}

/** Le domaine → la ligne, à l'écriture comme à la création. */
export function saleTermsColumns(variant: SaleTermsFields): SaleTermsFields {
  return {
    saleUnit: variant.saleUnit,
    weightMinGrams: variant.weightMinGrams,
    weightStepGrams: variant.weightStepGrams,
    hasBeenPublished: variant.hasBeenPublished,
  };
}

function saleUnitOf(raw: string): SaleUnit {
  const unit = SALE_UNITS.find((candidate) => candidate === raw);
  if (unit === undefined) {
    throw new UnknownStoredSaleUnitError(raw);
  }
  return unit;
}

/** Une unité de vente que la contrainte en base aurait dû refuser. */
class UnknownStoredSaleUnitError extends TechnicalError {
  constructor(raw: string) {
    super(
      "catalogue.variant.unknown_sale_unit",
      `Unité de vente « ${raw} » inconnue en base sur une déclinaison : la contrainte ` +
        `product_variant_sale_unit_check a été contournée — corriger la ligne en base.`,
    );
  }
}
