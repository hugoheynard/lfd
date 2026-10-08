import { floorInMm, stackLevels } from "./floor/floor-geometry.js";
import type { LoadingWarningKind } from "./loading-warnings.js";
import { type PlanBin, physicalKey, planLoading, type PlanStop } from "./loading-plan.js";
import type { PlanVehicle } from "./loading-volume.js";
import type { RoutingStop } from "./route-timing.js";
import type { PlanRoute, Routes } from "./vehicle-plan.js";

/** Millimètres cubes dans un litre ; millimètres carrés dans un centimètre carré. */
const MM3_PER_LITER = 1_000_000;
const MM2_PER_CM2 = 100;

/**
 * **Ce que la composition sait de la place** (CA4) : la charge de chaque
 * véhicule, et les bacs de chaque commande dont la demande est CONNUE.
 * Une commande absente de `bins` n'occupe rien : demande inconnue, ou arrêt
 * placé à la main dont la tournée n'est pas recomposée. Une tournée mêlée est
 * donc jugée sur sa part CONNUE (2026-10-06) — un minorant de sa charge
 * réelle : si cette part déborde déjà, la tournée déborde, le refus est sûr ;
 * si elle tient, rien n'est promis, et l'écran le dit.
 */
export interface CompositionCapacity {
  readonly vehicles: ReadonlyMap<string, PlanVehicle>;
  readonly bins: ReadonlyMap<string, readonly PlanBin[]>;
  /** Le jeu entre bacs des réglages (G5a) : celui de l'écran de chargement. */
  readonly binGapCm: number;
}

/** Les tournées d'un véhicule tiennent-elles toutes dans sa caisse ? */
export interface CapacityGuard {
  fits(vehicleId: string, routes: Routes): boolean;
}

/** Sans capacité fournie (simulateur, tests de l'horaire) : rien n'est refusé. */
export const NO_CAPACITY_LIMIT: CapacityGuard = { fits: () => true };

/**
 * Les alertes du plan de chargement qui REFUSENT une place (CA4). `compacted`
 * n'en est pas : des bacs posés derrière d'autres tiennent quand même.
 * `unknown_cargo` en est une — un volume inconnu n'est jamais lu « ça tient ».
 */
const REFUSING: ReadonlySet<LoadingWarningKind> = new Set([
  "dry_over",
  "cold_over",
  "floor_over",
  "unknown_cargo",
]);

/**
 * **La garde de capacité** (CA4) : une tournée tient si `planLoading` la
 * charge sans débordement — le MÊME algorithme que le dépôt, compactage
 * permis. Deux majorants bon marché la refusent d'abord (litres, surface des
 * piles au sol) ; le plan exact ne sert qu'à confirmer. Chaque tournée est
 * jugée une fois : par objet (un geste garde intactes les tournées qu'il ne
 * touche pas), puis par suite d'arrêts.
 */
export function capacityGuardOf(capacity: CompositionCapacity): CapacityGuard {
  const approved = new WeakMap<PlanRoute, string>();
  const known = new Map<string, boolean>();
  const routeFits = (vehicleId: string, route: PlanRoute): boolean => {
    if (approved.get(route) === vehicleId) {
      return true;
    }
    const key = `${vehicleId}|${route.stops.map((stop) => stop.id).join(",")}`;
    let verdict = known.get(key);
    if (verdict === undefined) {
      verdict = stopsFit(capacity, vehicleId, route.stops);
      known.set(key, verdict);
    }
    if (verdict) {
      approved.set(route, vehicleId);
    }
    return verdict;
  };
  return { fits: (vehicleId, routes) => routes.every((route) => routeFits(vehicleId, route)) };
}

function stopsFit(
  capacity: CompositionCapacity,
  vehicleId: string,
  stops: readonly RoutingStop[],
): boolean {
  const planStops: PlanStop[] = stops.map((stop, index) => ({
    position: index + 1,
    orderId: stop.id,
    reference: "",
    customerLabel: "",
    bins: capacity.bins.get(stop.id) ?? [],
  }));
  const bins = uniquePhysical(planStops.flatMap((stop) => stop.bins));
  if (bins.length === 0) {
    return true;
  }
  const vehicle = capacity.vehicles.get(vehicleId);
  if (vehicle === undefined || vehicle.floor === null || !withinBounds(bins, vehicle)) {
    return false;
  }
  return !planLoading(planStops, vehicle, capacity.binGapCm).warnings.some((warning) =>
    REFUSING.has(warning.kind),
  );
}

function uniquePhysical(bins: readonly PlanBin[]): readonly PlanBin[] {
  const seen = new Map<string, PlanBin>();
  for (const bin of bins) {
    seen.set(physicalKey(bin), bin);
  }
  return [...seen.values()];
}

/**
 * Deux conditions NÉCESSAIRES, sans poser une pile : les litres extérieurs
 * (sec et froid, comme `loadingVolumeOf`), et la surface au sol des piles
 * les plus hautes possible — `maxStack` borné par le plafond, la règle de
 * `stackLevels` — face à celle du plancher. Un bac sec plus haut que la
 * caisse ne tient pas.
 */
function withinBounds(bins: readonly PlanBin[], vehicle: PlanVehicle): boolean {
  const cold = vehicle.refrigeratedLiters !== null;
  let dryMm3 = 0;
  let coldMm3 = 0;
  const perType = new Map<string, { count: number; maxStack: number; footprintMm2: number }>();
  for (const { binType } of bins) {
    const mm3 = binType.outerLengthMm * binType.outerWidthMm * binType.outerHeightMm;
    if (binType.isotherm && cold) {
      coldMm3 += mm3;
    } else {
      dryMm3 += mm3;
    }
    const entry = perType.get(binType.id) ?? {
      count: 0,
      maxStack: levelsIn(vehicle, binType, cold),
      footprintMm2: binType.outerLengthMm * binType.outerWidthMm,
    };
    if (entry.maxStack === 0) {
      return false;
    }
    entry.count += 1;
    perType.set(binType.id, entry);
  }
  const dryCapacity = (vehicle.cargoLiters ?? 0) - (vehicle.refrigeratedLiters ?? 0);
  if (Math.ceil(dryMm3 / MM3_PER_LITER) > dryCapacity) {
    return false;
  }
  if (cold && Math.ceil(coldMm3 / MM3_PER_LITER) > (vehicle.refrigeratedLiters ?? 0)) {
    return false;
  }
  const floor = vehicle.floor;
  const floorMm2 = floor === null ? 0 : floor.lengthCm * floor.widthCm * MM2_PER_CM2;
  let stacksMm2 = 0;
  for (const entry of perType.values()) {
    stacksMm2 += Math.ceil(entry.count / entry.maxStack) * entry.footprintMm2;
  }
  return stacksMm2 <= floorMm2;
}

/** Les étages d'un type dans ce véhicule ; un isotherme en caisse froide n'a que sa pile. */
function levelsIn(vehicle: PlanVehicle, binType: PlanBin["binType"], cold: boolean): number {
  const pile = Math.max(1, binType.maxStack);
  if ((binType.isotherm && cold) || vehicle.floor === null) {
    return pile;
  }
  return stackLevels(floorInMm(vehicle.floor), binType.outerHeightMm, pile);
}
