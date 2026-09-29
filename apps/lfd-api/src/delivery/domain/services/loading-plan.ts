import type { BinHalf } from "../value-objects/bin-declaration.js";
import {
  type LoadingVolume,
  loadingVolumeOf,
  type PlanUnit,
  type PlanVehicle,
} from "./loading-volume.js";
import { type LoadingWarning, loadingWarningsOf } from "./loading-warnings.js";

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
}

export interface LoadingPlan {
  readonly steps: readonly LoadingStep[];
  readonly stacks: readonly LoadingStack[];
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
 * **Le plan de chargement v1** (lot 4 bis, L4b-C7, v2-5) — pur : ORDRE et
 * VOLUME, aucune géométrie.
 *
 * - L'ordre de chargement est l'inverse de la tournée : le dernier arrêt
 *   d'abord, au fond.
 * - Un bac partagé dont les deux commandes sont dans la tournée va à l'étape
 *   du PREMIER des deux arrêts, en dernier : en haut de sa pile (v2-4). Ses
 *   deux moitiés y sont listées, côte à côte ; c'est UN bac physique.
 * - Piles : chaque bac physique va sur la dernière pile ouverte de son type si
 *   elle n'a pas atteint `maxStack`, sinon il en ouvre une. Une pile porte
 *   donc plusieurs arrêts : le suivant chargé — livré avant — est au-dessus.
 *
 * @param stops les arrêts vivants dans l'ordre de passage, leurs bacs non annulés.
 */
export function planLoading(stops: readonly PlanStop[], vehicle: PlanVehicle): LoadingPlan {
  const buckets = placeBins(stops);
  const stacker = new Stacker();
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
  return {
    steps,
    stacks: stacker.stacks(),
    volume,
    warnings: loadingWarningsOf(units, vehicle, volume),
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
    if (last !== undefined && last.height < binType.maxStack) {
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
    return stack;
  }

  stacks(): readonly LoadingStack[] {
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
