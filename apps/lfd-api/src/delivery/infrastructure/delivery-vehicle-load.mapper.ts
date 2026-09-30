import type { CargoDimensions } from "../domain/value-objects/cargo-space.js";
import type { RefrigerationSpec } from "../domain/value-objects/refrigerated-compartment.js";
import type { MeasuredWheelArches } from "../domain/value-objects/wheel-arches.js";

/** Les dix colonnes du chargement, telles que la ligne les porte. */
export interface VehicleLoadColumns {
  readonly cargoLengthCm: number | null;
  readonly cargoWidthCm: number | null;
  readonly cargoHeightCm: number | null;
  readonly refrigeratedVolumeLiters: number | null;
  readonly refrigeratedMinTempC: number | null;
  readonly refrigeratedMaxTempC: number | null;
  readonly wheelArchLengthCm: number | null;
  readonly wheelArchProtrusionCm: number | null;
  readonly wheelArchFromBackCm: number | null;
  readonly wheelArchHeightCm: number | null;
}

/**
 * Colonnes → dimensions. « Les trois ou aucune » est tenu par un CHECK : une
 * colonne `NULL` suffit donc à dire « inconnues ».
 */
export function cargoOfRow(row: VehicleLoadColumns): CargoDimensions | null {
  const { cargoLengthCm, cargoWidthCm, cargoHeightCm } = row;
  if (cargoLengthCm === null || cargoWidthCm === null || cargoHeightCm === null) {
    return null;
  }
  return { lengthCm: cargoLengthCm, widthCm: cargoWidthCm, heightCm: cargoHeightCm };
}

/** Colonnes → caisse réfrigérée ; même règle « tout ou rien » que les dimensions. */
export function refrigerationOfRow(row: VehicleLoadColumns): RefrigerationSpec | null {
  const { refrigeratedVolumeLiters, refrigeratedMinTempC, refrigeratedMaxTempC } = row;
  if (
    refrigeratedVolumeLiters === null ||
    refrigeratedMinTempC === null ||
    refrigeratedMaxTempC === null
  ) {
    return null;
  }
  return {
    volumeLiters: refrigeratedVolumeLiters,
    minTempC: refrigeratedMinTempC,
    maxTempC: refrigeratedMaxTempC,
  };
}

/** Colonnes → passages de roue ; « tout ou rien » tenu par un CHECK, comme les dimensions. */
export function wheelArchesOfRow(row: VehicleLoadColumns): MeasuredWheelArches | null {
  const { wheelArchLengthCm, wheelArchProtrusionCm, wheelArchFromBackCm, wheelArchHeightCm } = row;
  if (
    wheelArchLengthCm === null ||
    wheelArchProtrusionCm === null ||
    wheelArchFromBackCm === null ||
    wheelArchHeightCm === null
  ) {
    return null;
  }
  return {
    lengthCm: wheelArchLengthCm,
    protrusionCm: wheelArchProtrusionCm,
    fromBackCm: wheelArchFromBackCm,
    heightCm: wheelArchHeightCm,
  };
}

/** Dimensions, passages et froid → les dix colonnes, `NULL` pour ce qui manque. */
export function loadColumnsOf(
  cargo: CargoDimensions | null,
  wheelArches: MeasuredWheelArches | null,
  refrigeration: RefrigerationSpec | null,
): VehicleLoadColumns {
  return {
    cargoLengthCm: cargo?.lengthCm ?? null,
    cargoWidthCm: cargo?.widthCm ?? null,
    cargoHeightCm: cargo?.heightCm ?? null,
    refrigeratedVolumeLiters: refrigeration?.volumeLiters ?? null,
    refrigeratedMinTempC: refrigeration?.minTempC ?? null,
    refrigeratedMaxTempC: refrigeration?.maxTempC ?? null,
    wheelArchLengthCm: wheelArches?.lengthCm ?? null,
    wheelArchProtrusionCm: wheelArches?.protrusionCm ?? null,
    wheelArchFromBackCm: wheelArches?.fromBackCm ?? null,
    wheelArchHeightCm: wheelArches?.heightCm ?? null,
  };
}
