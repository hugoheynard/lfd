import type { PurchaseBinCandidateView } from "@lfd/contracts";

import type { PurchaseBinCandidateState } from "../domain/entities/purchase-bin-candidate.js";
import { BinDimensions } from "../domain/value-objects/bin-dimensions.js";

/** Une ligne `delivery.delivery_purchase_bin_candidate`, telle que l'adaptateur la lit. */
export interface PurchaseBinCandidateRow {
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
  readonly supplier: string | null;
  readonly reference: string | null;
  readonly purchaseUrl: string | null;
  readonly unitPriceCentsExclVat: number | null;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
  readonly updatedAt: Date;
  readonly updatedByStaffId: string;
  readonly updatedByName: string;
  readonly updatedByRole: string;
  readonly archivedAt: Date | null;
}

/** Ligne → état de l'agrégat (que `restore` revalide). */
export function binCandidateStateOf(row: PurchaseBinCandidateRow): PurchaseBinCandidateState {
  return {
    id: row.id,
    name: row.name,
    outer: { lengthCm: row.outerLengthCm, widthCm: row.outerWidthCm, heightCm: row.outerHeightCm },
    inner: { lengthCm: row.innerLengthCm, widthCm: row.innerWidthCm, heightCm: row.innerHeightCm },
    isotherm: row.isotherm,
    maxStack: row.maxStack,
    supplier: row.supplier,
    reference: row.reference,
    purchaseUrl: row.purchaseUrl,
    unitPriceCentsExclVat: row.unitPriceCentsExclVat,
    createdAt: row.createdAt,
    createdByStaffId: row.createdByStaffId,
    updatedAt: row.updatedAt,
    updatedBy: {
      staffUserId: row.updatedByStaffId,
      name: row.updatedByName,
      role: row.updatedByRole,
    },
    archivedAt: row.archivedAt,
  };
}

/** État de l'agrégat → colonnes. */
export function binCandidateRowOf(state: PurchaseBinCandidateState): PurchaseBinCandidateRow {
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
    supplier: state.supplier,
    reference: state.reference,
    purchaseUrl: state.purchaseUrl,
    unitPriceCentsExclVat: state.unitPriceCentsExclVat,
    createdAt: state.createdAt,
    createdByStaffId: state.createdByStaffId,
    updatedAt: state.updatedAt,
    updatedByStaffId: state.updatedBy.staffUserId,
    updatedByName: state.updatedBy.name,
    updatedByRole: state.updatedBy.role,
    archivedAt: state.archivedAt,
  };
}

/** Ligne → vue. Le volume intérieur se dérive par le value object : une seule formule. */
export function binCandidateViewOf(row: PurchaseBinCandidateRow): PurchaseBinCandidateView {
  const state = binCandidateStateOf(row);
  return {
    id: state.id,
    name: state.name,
    outer: state.outer,
    inner: state.inner,
    innerVolumeLiters: BinDimensions.of("intérieures", state.inner).volumeLiters,
    isotherm: state.isotherm,
    maxStack: state.maxStack,
    supplier: state.supplier,
    reference: state.reference,
    purchaseUrl: state.purchaseUrl,
    unitPriceCentsExclVat: state.unitPriceCentsExclVat,
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
    updatedBy: state.updatedBy,
    archivedAt: state.archivedAt?.toISOString() ?? null,
  };
}
