import { CargoFloor } from "../../value-objects/cargo-floor.js";
import type { CompositionCapacity } from "../capacity-guard.js";
import type { PlanBin, PlanBinType } from "../loading-plan.js";
import type { PlanVehicle } from "../loading-volume.js";

/**
 * Les briques des tests de la capacité (CA4) : un type de bac en mm, des
 * véhicules dont le plancher est en cm — les deux unités que le plan de
 * chargement réconcilie (0bcb955a6).
 */

/** 60 × 40 × 22 cm extérieurs, piles de 5. */
export const BAC_M: PlanBinType = {
  id: "bin_m",
  name: "Bac M",
  isotherm: false,
  outerLengthMm: 600,
  outerWidthMm: 400,
  outerHeightMm: 220,
  maxStack: 5,
};

/** Une manne à pain, 66,5 × 46 × 30 cm, piles de 6 — le contenant par défaut des tests. */
export const MANNE: PlanBinType = {
  id: "manne",
  name: "Manne",
  isotherm: false,
  outerLengthMm: 665,
  outerWidthMm: 460,
  outerHeightMm: 300,
  maxStack: 6,
};

/** Un véhicule mesuré : plancher rectangulaire, sans caisse froide. */
export function measured(name: string, lengthCm: number, widthCm: number, heightCm: number) {
  const floor = CargoFloor.of({ lengthCm, widthCm, heightCm, wheelArches: null });
  return {
    name,
    cargoLiters: floor.volumeLiters,
    refrigeratedLiters: null,
    floor,
  } satisfies PlanVehicle;
}

/** `count` bacs entiers de la commande `orderId`. */
export function binsOf(orderId: string, count: number, binType = BAC_M): readonly PlanBin[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${orderId}-b${String(index + 1)}`,
    code: "",
    binType,
    half: null,
    physicalBinId: null,
    partner: null,
    toRedo: false,
  }));
}

/** La capacité d'une scène : des véhicules par id, et le nombre de bacs de chaque commande. */
export function capacityOf(
  vehicles: Readonly<Record<string, PlanVehicle>>,
  bins: Readonly<Record<string, number>>,
): CompositionCapacity {
  return {
    vehicles: new Map(Object.entries(vehicles)),
    bins: new Map(
      Object.entries(bins).map(([orderId, count]) => [orderId, binsOf(orderId, count)]),
    ),
  };
}

/**
 * Une petite caisse : 70 × 50 × 120 cm — UNE pile de Bacs M au sol, cinq
 * bacs au plus (5 × 22 = 110 cm sous 120).
 */
export const ONE_STACK = measured("Vélo-cargo", 70, 50, 120);

/** Une grande caisse : 250 × 160 × 140 cm. */
export const ROOMY = measured("Trafic", 250, 160, 140);
