import type { BinHalf } from "../value-objects/bin-declaration.js";
import { BIN_GAP_DEFAULT_CM } from "../value-objects/bin-gap.js";
import type { CargoFloor } from "../value-objects/cargo-floor.js";
import { FloorPlacer, type StackPlacement } from "./floor/place-stacks.js";
import { physicalKey, Stacker, type StackingMode } from "./loading-stacker.js";
import { type LoadingVolume, loadingVolumeOf, type PlanVehicle } from "./loading-volume.js";
import {
  compactedWarning,
  floorOverWarning,
  type LoadingWarning,
  loadingWarningsOf,
} from "./loading-warnings.js";

export { physicalKey } from "./loading-stacker.js";

/** Un type de bac, tel que le plan le lit : sa forme EXTÉRIEURE (en mm) et sa pile. */
export interface PlanBinType {
  readonly id: string;
  readonly name: string;
  readonly isotherm: boolean;
  readonly outerLengthMm: number;
  readonly outerWidthMm: number;
  readonly outerHeightMm: number;
  readonly maxStack: number;
}

/** Un bac NON annulé d'un arrêt (entier, ou une moitié). */
export interface PlanBin {
  readonly id: string;
  readonly code: string;
  readonly binType: PlanBinType;
  readonly half: BinHalf | null;
  readonly physicalBinId: string | null;
  /** L'autre commande d'un bac partagé, ou `null`. */
  readonly partner: { readonly orderId: string; readonly reference: string } | null;
  /** Bac partagé à refaire (v2-4), calculé par `isSharedBinToRedo`. */
  readonly toRedo: boolean;
}

/** Un arrêt vivant, dans l'ordre de PASSAGE. */
export interface PlanStop {
  readonly position: number;
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  readonly bins: readonly PlanBin[];
}

export interface PlannedBin {
  readonly bin: PlanBin;
  /** La commande à qui est ce bac. */
  readonly reference: string;
  readonly stackIndex: number;
  /**
   * Posé « derrière » : sur une pile d'une rangée déjà fermée, avec des bacs
   * chargés après lui entre lui et les portes. Seul le plan compacté en pose
   * (cf. `planLoading`, étape 2) ; il faudra en sortir pour l'atteindre.
   */
  readonly behind: boolean;
}

export interface LoadingStep {
  readonly step: number;
  readonly stop: PlanStop;
  readonly bins: readonly PlannedBin[];
}

export interface LoadingStack {
  readonly stackIndex: number;
  readonly binType: PlanBinType;
  readonly height: number;
  readonly stopPositions: readonly number[];
  /** Où poser la pile (G5), ou `null` : le plancher du véhicule est inconnu. */
  readonly placement: StackPlacement | null;
}

export interface LoadingPlan {
  readonly steps: readonly LoadingStep[];
  readonly stacks: readonly LoadingStack[];
  /** Le plancher sur lequel les piles sont posées, ou `null`. */
  readonly floor: CargoFloor | null;
  readonly volume: LoadingVolume;
  readonly warnings: readonly LoadingWarning[];
}

/** Un bac placé dans une étape, avant sa pile. */
interface Placed {
  readonly bin: PlanBin;
  readonly owner: PlanStop;
  readonly shared: boolean;
}

/**
 * **Le plan de chargement** (lot 4 bis, L4b-C7, v2-5, G5) — pur : ORDRE,
 * VOLUME, et la place de chaque pile sur le plancher (stratégie B, G-D4) quand
 * le véhicule a ses dimensions.
 *
 * - L'ordre de chargement est l'inverse de la tournée : le dernier arrêt
 *   d'abord, au fond.
 * - Un bac partagé dont les deux commandes sont dans la tournée va à l'étape
 *   du PREMIER des deux arrêts, en dernier : en haut de sa pile (v2-4). Ses
 *   deux moitiés y sont listées, côte à côte ; c'est UN bac physique.
 * - Piles : chaque bac physique va sur la dernière pile ouverte de son type si
 *   elle n'a pas atteint ses étages ET que sa rangée est encore la rangée
 *   ouverte, sinon il en ouvre une. Une pile porte donc plusieurs arrêts : le
 *   suivant chargé — livré avant — est au-dessus.
 * - Une pile se pose au sol dès qu'elle s'ouvre (G-D4 ter, 2026-10-03) : sans
 *   ça, le premier arrêt de la tournée finissait sur une pile du FOND, ouverte
 *   par le dernier arrêt, et l'arrêt se retrouvait coupé entre le fond et les
 *   portes (constaté sur le semis, Hugo).
 * - Les étages d'une pile sont `min(maxStack, ⌊hauteur utile ÷ hauteur du
 *   bac⌋)` (`FloorPlacer.levelsOf`, la règle de la stratégie A) : jusqu'au
 *   2026-10-06, seul `maxStack` comptait, et deux mannes de 715 mm montaient
 *   l'une sur l'autre dans une caisse de 140 cm. Un bac plus haut que la
 *   caisse ouvre une pile hors plancher (`floor_over`). Sans plancher connu,
 *   aucun plafond : `unknown_cargo` le dit déjà, et la garde le refuse.
 *
 * @param stops les arrêts vivants dans l'ordre de passage, leurs bacs non annulés.
 */
export function planLoading(stops: readonly PlanStop[], vehicle: PlanVehicle): LoadingPlan {
  const coherent = buildPlan(stops, vehicle, "coherent");
  if (vehicle.floor === null || offFloorBins(coherent) === 0) {
    return coherent;
  }
  const compact = buildPlan(stops, vehicle, "compact");
  if (offFloorBins(compact) >= offFloorBins(coherent)) {
    return coherent;
  }
  const behind = compact.steps.flatMap((step) =>
    step.bins.filter((planned) => planned.behind).map(() => step.stop.position),
  );
  const compacted = compactedWarning(
    behind.length,
    [...new Set(behind)],
    offFloorBins(compact) === 0,
  );
  return {
    ...compact,
    warnings: compacted === null ? compact.warnings : [...compact.warnings, compacted],
  };
}

/**
 * Les bacs restés hors plancher : la mesure qui départage les deux plans. Un
 * bac, pas une pile — deux plans n'ont pas les mêmes piles.
 */
function offFloorBins(plan: LoadingPlan): number {
  const outside = new Set(
    plan.stacks
      .filter((stack) => stack.placement?.kind === "off_floor")
      .map((stack) => stack.stackIndex),
  );
  return plan.steps.flatMap((step) => step.bins).filter((p) => outside.has(p.stackIndex)).length;
}

function buildPlan(
  stops: readonly PlanStop[],
  vehicle: PlanVehicle,
  mode: StackingMode,
): LoadingPlan {
  const buckets = placeBins(stops);
  const placer =
    vehicle.floor === null
      ? null
      : new FloorPlacer(vehicle.floor, BIN_GAP_DEFAULT_CM, vehicle.refrigeratedLiters !== null);
  const stacker = new Stacker(placer, mode);
  const steps: LoadingStep[] = [];
  for (let rank = stops.length - 1; rank >= 0; rank -= 1) {
    const stop = stops[rank];
    if (stop === undefined) {
      continue;
    }
    const bins = orderWithinStep(buckets.get(rank) ?? []).map((placed): PlannedBin => ({
      bin: placed.bin,
      reference: placed.owner.reference,
      ...stacker.put(placed.bin, stop.position),
    }));
    steps.push({ step: steps.length + 1, stop, bins });
  }
  const units = stacker.units();
  const volume = loadingVolumeOf(units, vehicle);
  const placements = placer?.placements() ?? null;
  const stacks: readonly LoadingStack[] = stacker
    .stacks()
    .map((stack) => ({ ...stack, placement: placements?.get(stack.stackIndex) ?? null }));
  const offFloor = stacks.filter((stack) => stack.placement?.kind === "off_floor");
  const floorOver = floorOverWarning(
    vehicle,
    { offFloor: offFloor.length, tooTall: placer?.tooTallStacks().size ?? 0 },
    [...new Set(offFloor.flatMap((stack) => stack.stopPositions))],
  );
  return {
    steps,
    stacks,
    floor: vehicle.floor,
    volume,
    warnings: [
      ...loadingWarningsOf(units, vehicle, volume),
      ...(floorOver === null ? [] : [floorOver]),
    ],
  };
}

/** À quel rang de passage chaque bac est chargé. */
function placeBins(stops: readonly PlanStop[]): ReadonlyMap<number, readonly Placed[]> {
  const rankOf = new Map(stops.map((stop, rank) => [stop.orderId, rank]));
  const buckets = new Map<number, Placed[]>();
  stops.forEach((stop, ownRank) => {
    for (const bin of stop.bins) {
      const partnerRank = bin.partner === null ? undefined : rankOf.get(bin.partner.orderId);
      const rank = partnerRank === undefined ? ownRank : Math.min(ownRank, partnerRank);
      const bucket = buckets.get(rank) ?? [];
      bucket.push({ bin, owner: stop, shared: partnerRank !== undefined });
      buckets.set(rank, bucket);
    }
  });
  return buckets;
}

/** Les bacs de l'arrêt d'abord, les bacs partagés en dernier — deux moitiés côte à côte. */
function orderWithinStep(placed: readonly Placed[]): readonly Placed[] {
  const own = placed.filter((entry) => !entry.shared);
  const shared = placed
    .filter((entry) => entry.shared)
    .sort((a, b) => physicalKey(a.bin).localeCompare(physicalKey(b.bin)));
  return [...own, ...shared];
}
