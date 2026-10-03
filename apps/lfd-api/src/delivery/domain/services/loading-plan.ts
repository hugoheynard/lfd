import type { BinHalf } from "../value-objects/bin-declaration.js";
import { BIN_GAP_DEFAULT_CM } from "../value-objects/bin-gap.js";
import type { CargoFloor } from "../value-objects/cargo-floor.js";
import { FloorPlacer, type StackPlacement } from "./floor/place-stacks.js";
import {
  type LoadingVolume,
  loadingVolumeOf,
  type PlanUnit,
  type PlanVehicle,
} from "./loading-volume.js";
import { floorOverWarning, type LoadingWarning, loadingWarningsOf } from "./loading-warnings.js";

/** Un type de bac, tel que le plan le lit : sa forme EXTÉRIEURE et sa pile. */
export interface PlanBinType {
  readonly id: string;
  readonly name: string;
  readonly isotherm: boolean;
  readonly outerLengthCm: number;
  readonly outerWidthCm: number;
  readonly outerHeightCm: number;
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
 *   elle n'a pas atteint `maxStack` ET que sa rangée est encore la rangée
 *   ouverte, sinon il en ouvre une. Une pile porte donc plusieurs arrêts : le
 *   suivant chargé — livré avant — est au-dessus.
 * - Une pile se pose au sol dès qu'elle s'ouvre (G-D4 ter, 2026-10-03) : sans
 *   ça, le premier arrêt de la tournée finissait sur une pile du FOND, ouverte
 *   par le dernier arrêt, et l'arrêt se retrouvait coupé entre le fond et les
 *   portes (constaté sur le semis, Hugo).
 *
 * @param stops les arrêts vivants dans l'ordre de passage, leurs bacs non annulés.
 */
export function planLoading(stops: readonly PlanStop[], vehicle: PlanVehicle): LoadingPlan {
  const buckets = placeBins(stops);
  const placer =
    vehicle.floor === null
      ? null
      : new FloorPlacer(vehicle.floor, BIN_GAP_DEFAULT_CM, vehicle.refrigeratedLiters !== null);
  const stacker = new Stacker(placer);
  const steps: LoadingStep[] = [];
  for (let rank = stops.length - 1; rank >= 0; rank -= 1) {
    const stop = stops[rank];
    if (stop === undefined) {
      continue;
    }
    const bins = orderWithinStep(buckets.get(rank) ?? []).map((placed): PlannedBin => ({
      bin: placed.bin,
      reference: placed.owner.reference,
      stackIndex: stacker.put(placed.bin, stop.position),
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
  const floorOver = floorOverWarning(vehicle, offFloor.length, [
    ...new Set(offFloor.flatMap((stack) => stack.stopPositions)),
  ]);
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

/** Le bac PHYSIQUE : celui d'une moitié, ou le bac entier lui-même. */
export function physicalKey(bin: PlanBin): string {
  return bin.physicalBinId ?? bin.id;
}

interface OpenStack {
  readonly stackIndex: number;
  readonly binType: PlanBinType;
  height: number;
  readonly stopPositions: number[];
}

/** Pose les bacs physiques en piles, dans l'ordre où on les charge. */
class Stacker {
  private readonly all: OpenStack[] = [];

  /** `null` : un véhicule sans cotes n'a pas de rangées, aucune pile ne ferme. */
  constructor(private readonly placer: FloorPlacer | null) {}

  private readonly lastOfType = new Map<string, OpenStack>();
  private readonly placed = new Map<string, { stack: OpenStack; unit: PlanUnit }>();

  /** Rend la pile du bac ; une seconde moitié rejoint celle de la première. */
  put(bin: PlanBin, stopPosition: number): number {
    const key = physicalKey(bin);
    const known = this.placed.get(key);
    if (known !== undefined) {
      known.unit.bins.push(bin);
      return known.stack.stackIndex;
    }
    const stack = this.stackFor(bin.binType);
    stack.height += 1;
    if (!stack.stopPositions.includes(stopPosition)) {
      stack.stopPositions.push(stopPosition);
    }
    this.placed.set(key, { stack, unit: { binType: bin.binType, bins: [bin] } });
    return stack.stackIndex;
  }

  private stackFor(binType: PlanBinType): OpenStack {
    const last = this.lastOfType.get(binType.id);
    if (
      last !== undefined &&
      last.height < binType.maxStack &&
      (this.placer?.canGrow(last.stackIndex) ?? true)
    ) {
      return last;
    }
    const stack: OpenStack = {
      stackIndex: this.all.length + 1,
      binType,
      height: 0,
      stopPositions: [],
    };
    this.all.push(stack);
    this.lastOfType.set(binType.id, stack);
    this.placer?.place({ stackIndex: stack.stackIndex, ...binType });
    return stack;
  }

  stacks(): readonly Omit<LoadingStack, "placement">[] {
    return this.all.map((stack) => ({
      stackIndex: stack.stackIndex,
      binType: stack.binType,
      height: stack.height,
      stopPositions: [...stack.stopPositions],
    }));
  }

  units(): readonly PlanUnit[] {
    return [...this.placed.values()].map((entry) => entry.unit);
  }
}
