import type { BinHalf } from "../value-objects/bin-declaration.js";
import type { CargoFloor } from "../value-objects/cargo-floor.js";

/** Millimètres cubes dans un litre : un type de bac se mesure au millimètre. */
const MM3_PER_LITER = 1_000_000;

/** Ce que le plan sait du véhicule — les capacités DÉRIVÉES de sa charge (lot 2 bis). */
export interface PlanVehicle {
  readonly name: string;
  /** Volume utile en litres, ou `null` : dimensions non renseignées. */
  readonly cargoLiters: number | null;
  /** Volume de la caisse réfrigérée, ou `null` : véhicule sec. */
  readonly refrigeratedLiters: number | null;
  /** Le plancher, passages de roue compris (G5), ou `null` : dimensions non renseignées. */
  readonly floor: CargoFloor | null;
}

/** Un bac PHYSIQUE du plan : son type, et le ou les bacs déclarés qui le composent. */
export interface PlanUnit {
  readonly binType: {
    readonly isotherm: boolean;
    readonly outerLengthMm: number;
    readonly outerWidthMm: number;
    readonly outerHeightMm: number;
  };
  readonly bins: {
    readonly code: string;
    readonly half: BinHalf | null;
    readonly partner: { readonly reference: string } | null;
    readonly toRedo: boolean;
  }[];
}

export interface LoadingVolume {
  readonly dryLiters: number;
  readonly coldLiters: number;
  readonly dryCapacityLiters: number | null;
  readonly coldCapacityLiters: number | null;
  readonly dryOver: boolean;
  readonly coldOver: boolean;
  /** Bacs isothermes comptés au sec faute de caisse réfrigérée. */
  readonly coldBinsWithoutRefrigeration: number;
}

/**
 * Le volume EXTÉRIEUR des bacs physiques, face au véhicule (v2-5). Un bac
 * partagé compte une fois. Les litres utilisés s'arrondissent AU-DESSUS :
 * on ne promet pas une place qu'on n'a pas.
 *
 * La caisse réfrigérée est DANS le volume utile (le véhicule refuse qu'elle
 * l'excède, L2b-C2) : le sec disponible est l'utile moins la caisse. Sans
 * caisse, les isothermes vont au sec — l'alerte le dit.
 */
export function loadingVolumeOf(units: readonly PlanUnit[], vehicle: PlanVehicle): LoadingVolume {
  const cold = vehicle.refrigeratedLiters !== null;
  let dryMm3 = 0;
  let coldMm3 = 0;
  let coldBinsWithoutRefrigeration = 0;
  for (const unit of units) {
    const mm3 = unit.binType.outerLengthMm * unit.binType.outerWidthMm * unit.binType.outerHeightMm;
    if (unit.binType.isotherm && cold) {
      coldMm3 += mm3;
    } else {
      dryMm3 += mm3;
      coldBinsWithoutRefrigeration += unit.binType.isotherm ? 1 : 0;
    }
  }
  const dryLiters = Math.ceil(dryMm3 / MM3_PER_LITER);
  const coldLiters = Math.ceil(coldMm3 / MM3_PER_LITER);
  const dryCapacityLiters =
    vehicle.cargoLiters === null ? null : vehicle.cargoLiters - (vehicle.refrigeratedLiters ?? 0);
  const coldCapacityLiters = vehicle.refrigeratedLiters;
  return {
    dryLiters,
    coldLiters,
    dryCapacityLiters,
    coldCapacityLiters,
    dryOver: dryCapacityLiters !== null && dryLiters > dryCapacityLiters,
    coldOver: coldCapacityLiters !== null && coldLiters > coldCapacityLiters,
    coldBinsWithoutRefrigeration,
  };
}
