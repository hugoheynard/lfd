import type { BinTypeView } from "@lfd/contracts";

import type { BinTypeState } from "../domain/entities/bin-type.js";
import { BinTypeDimensions } from "../domain/value-objects/bin-type-dimensions.js";

/** Une ligne `delivery.delivery_bin_type`, telle que l'adaptateur la lit. */
export interface BinTypeRow {
  readonly id: string;
  readonly name: string;
  readonly outerLengthMm: number;
  readonly outerWidthMm: number;
  readonly outerHeightMm: number;
  readonly innerLengthMm: number;
  readonly innerWidthMm: number;
  readonly innerHeightMm: number;
  readonly isotherm: boolean;
  readonly maxStack: number;
  readonly divisible: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
}

/** Ligne → état de l'agrégat (que `BinType.restore` revalide). */
export function binTypeStateOf(row: BinTypeRow): BinTypeState {
  return {
    id: row.id,
    name: row.name,
    outer: { lengthMm: row.outerLengthMm, widthMm: row.outerWidthMm, heightMm: row.outerHeightMm },
    inner: { lengthMm: row.innerLengthMm, widthMm: row.innerWidthMm, heightMm: row.innerHeightMm },
    isotherm: row.isotherm,
    maxStack: row.maxStack,
    divisible: row.divisible,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

/** État de l'agrégat → colonnes. */
export function binTypeRowOf(state: BinTypeState): BinTypeRow {
  return {
    id: state.id,
    name: state.name,
    outerLengthMm: state.outer.lengthMm,
    outerWidthMm: state.outer.widthMm,
    outerHeightMm: state.outer.heightMm,
    innerLengthMm: state.inner.lengthMm,
    innerWidthMm: state.inner.widthMm,
    innerHeightMm: state.inner.heightMm,
    isotherm: state.isotherm,
    maxStack: state.maxStack,
    divisible: state.divisible,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    archivedAt: state.archivedAt,
  };
}

/** Ligne → vue. Le volume se dérive par le value object : une seule formule. */
export function binTypeViewOf(row: BinTypeRow): BinTypeView {
  const state = binTypeStateOf(row);
  return {
    id: row.id,
    name: row.name,
    outer: state.outer,
    inner: state.inner,
    innerVolumeLiters: BinTypeDimensions.of("intérieures", state.inner).volumeLiters,
    isotherm: row.isotherm,
    maxStack: row.maxStack,
    divisible: row.divisible,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}
