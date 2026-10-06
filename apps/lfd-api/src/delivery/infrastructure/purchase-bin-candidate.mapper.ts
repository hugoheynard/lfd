import type { PurchaseBinCandidateView } from "@lfd/contracts";

import type { PurchaseBinCandidateState } from "../domain/entities/purchase-bin-candidate.js";
import { BinTypeDimensions } from "../domain/value-objects/bin-type-dimensions.js";

/**
 * Une ligne `delivery.delivery_purchase_bin_candidate`, telle que l'adaptateur la lit —
 * dimensions en mm ; les colonnes `*_cm` sont mortes depuis le 2026-10-07.
 */
export interface PurchaseBinCandidateRow {
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
    outer: { lengthMm: row.outerLengthMm, widthMm: row.outerWidthMm, heightMm: row.outerHeightMm },
    inner: { lengthMm: row.innerLengthMm, widthMm: row.innerWidthMm, heightMm: row.innerHeightMm },
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
    outerLengthMm: state.outer.lengthMm,
    outerWidthMm: state.outer.widthMm,
    outerHeightMm: state.outer.heightMm,
    innerLengthMm: state.inner.lengthMm,
    innerWidthMm: state.inner.widthMm,
    innerHeightMm: state.inner.heightMm,
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
    innerVolumeLiters: BinTypeDimensions.of("intérieures", state.inner).volumeLiters,
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
