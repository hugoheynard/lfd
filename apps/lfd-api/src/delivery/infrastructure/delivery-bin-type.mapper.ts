import type { BinTypeView } from "@lfd/contracts";

import type { BinTypeState } from "../domain/entities/bin-type.js";
import { BinDimensions } from "../domain/value-objects/bin-dimensions.js";

/** Une ligne `production.delivery_bin_type`, telle que l'adaptateur la lit. */
export interface BinTypeRow {
  readonly id: string;
  readonly name: string;
  readonly outerLengthCm: number;
  readonly outerWidthCm: number;
  readonly outerHeightCm: number;
  readonly innerLengthCm: number;
  readonly innerWidthCm: number;
  readonly innerHeightCm: number;
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
    outer: { lengthCm: row.outerLengthCm, widthCm: row.outerWidthCm, heightCm: row.outerHeightCm },
    inner: { lengthCm: row.innerLengthCm, widthCm: row.innerWidthCm, heightCm: row.innerHeightCm },
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
    outerLengthCm: state.outer.lengthCm,
    outerWidthCm: state.outer.widthCm,
    outerHeightCm: state.outer.heightCm,
    innerLengthCm: state.inner.lengthCm,
    innerWidthCm: state.inner.widthCm,
    innerHeightCm: state.inner.heightCm,
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
    innerVolumeLiters: BinDimensions.of("intérieures", state.inner).volumeLiters,
    isotherm: row.isotherm,
    maxStack: row.maxStack,
    divisible: row.divisible,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}
