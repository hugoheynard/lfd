import type { PurchaseVehicleCandidateView } from "@lfd/contracts";

import type { PurchaseVehicleCandidateState } from "../domain/entities/purchase-vehicle-candidate.js";
import { CargoSpace } from "../domain/value-objects/cargo-space.js";

/** Une ligne `production.delivery_purchase_vehicle_candidate`, telle que l'adaptateur la lit. */
export interface PurchaseVehicleCandidateRow {
  readonly id: string;
  readonly name: string;
  readonly cargoLengthCm: number;
  readonly cargoWidthCm: number;
  readonly cargoHeightCm: number;
  readonly wheelArchLengthCm: number | null;
  readonly wheelArchProtrusionCm: number | null;
  readonly wheelArchFromBackCm: number | null;
  readonly wheelArchHeightCm: number | null;
  readonly reference: string | null;
  readonly purchaseUrl: string | null;
  readonly priceCentsExclVat: number | null;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
  readonly updatedAt: Date;
  readonly updatedByStaffId: string;
  readonly updatedByName: string;
  readonly updatedByRole: string;
  readonly archivedAt: Date | null;
}

/** Ligne → état de l'agrégat (que `restore` revalide). Le CHECK garantit « les quatre ou aucune ». */
export function vehicleCandidateStateOf(
  row: PurchaseVehicleCandidateRow,
): PurchaseVehicleCandidateState {
  const {
    wheelArchLengthCm: lengthCm,
    wheelArchProtrusionCm: protrusionCm,
    wheelArchFromBackCm: fromBackCm,
    wheelArchHeightCm: heightCm,
  } = row;
  const wheelArches =
    lengthCm === null || protrusionCm === null || fromBackCm === null || heightCm === null
      ? null
      : { lengthCm, protrusionCm, fromBackCm, heightCm };
  return {
    id: row.id,
    name: row.name,
    cargo: { lengthCm: row.cargoLengthCm, widthCm: row.cargoWidthCm, heightCm: row.cargoHeightCm },
    wheelArches,
    reference: row.reference,
    purchaseUrl: row.purchaseUrl,
    priceCentsExclVat: row.priceCentsExclVat,
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
export function vehicleCandidateRowOf(
  state: PurchaseVehicleCandidateState,
): PurchaseVehicleCandidateRow {
  return {
    id: state.id,
    name: state.name,
    cargoLengthCm: state.cargo.lengthCm,
    cargoWidthCm: state.cargo.widthCm,
    cargoHeightCm: state.cargo.heightCm,
    wheelArchLengthCm: state.wheelArches?.lengthCm ?? null,
    wheelArchProtrusionCm: state.wheelArches?.protrusionCm ?? null,
    wheelArchFromBackCm: state.wheelArches?.fromBackCm ?? null,
    wheelArchHeightCm: state.wheelArches?.heightCm ?? null,
    reference: state.reference,
    purchaseUrl: state.purchaseUrl,
    priceCentsExclVat: state.priceCentsExclVat,
    createdAt: state.createdAt,
    createdByStaffId: state.createdByStaffId,
    updatedAt: state.updatedAt,
    updatedByStaffId: state.updatedBy.staffUserId,
    updatedByName: state.updatedBy.name,
    updatedByRole: state.updatedBy.role,
    archivedAt: state.archivedAt,
  };
}

/** Ligne → vue. Le volume se dérive par le value object : une seule formule. */
export function vehicleCandidateViewOf(
  row: PurchaseVehicleCandidateRow,
): PurchaseVehicleCandidateView {
  const state = vehicleCandidateStateOf(row);
  return {
    id: state.id,
    name: state.name,
    cargo: { ...state.cargo, volumeLiters: CargoSpace.of(state.cargo).volumeLiters },
    wheelArches: state.wheelArches,
    reference: state.reference,
    purchaseUrl: state.purchaseUrl,
    priceCentsExclVat: state.priceCentsExclVat,
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
    updatedBy: state.updatedBy,
    archivedAt: state.archivedAt?.toISOString() ?? null,
  };
}
