import type { PackedItem, PackingBinType, PackingCapacity } from "./propose-packing.js";

/**
 * **Coliser UN groupe** (froid, ou sec) dans les types qui lui sont permis —
 * l'heuristique du colisage proposé (lot 4 bis, L4b-C4, v2-3). Pure et
 * déterministe : les égalités se départagent par l'ordre du catalogue.
 *
 * Le but : **le moins de bacs possible, et à égalité le moins de volume**.
 * Le problème exact est un bin-packing ; on s'en tient à une heuristique
 * gloutonne, lisible et testée, qui fait ce qu'un préparateur ferait :
 *
 * 1. si TOUT le reste tient dans un seul bac — ou une moitié, pour un type
 *    cloisonnable et un reste ≤ 0,5 — on prend le plus petit qui convient
 *    (une moitié compte pour la moitié du volume de son type) ;
 * 2. sinon on remplit UN bac entier du type qui demanderait le moins de bacs
 *    pour tout le reste (à égalité, le moins de volume), et on recommence :
 *    c'est ainsi qu'on remplit en grand, puis qu'on « descend d'une taille »
 *    pour le reste ;
 * 3. si aucun type ne contient tous les produits restants, on remplit un bac
 *    du type qui en contient le plus.
 *
 * Chaque tour place au moins une unité (une contenance vaut au moins 1) :
 * la boucle termine.
 */

/** Ce qu'offre une moitié de bac cloisonné (v2-3). */
export const HALF_BIN = 0.5;

/** Tolérance des sommes de fractions (1/3 + 1/3 + 1/3 doit tenir dans 1). */
const EPSILON = 1e-9;

/** Un bac proposé : entier ou moitié, sa charge (en bacs entiers) et son contenu. */
export interface BinSlot {
  readonly binTypeId: string;
  readonly half: boolean;
  /** En fraction d'un bac ENTIER : une moitié pleine vaut 0,5. */
  readonly load: number;
  readonly content: readonly PackedItem[];
}

/** La grille des contenances, lue par case. */
export interface CapacityGrid {
  /** Les unités d'un bac entier, ou `null` : ce produit ne va pas dans ce type. */
  unitsOf(binTypeId: string, sku: string): number | null;
}

export function capacityGrid(capacities: readonly PackingCapacity[]): CapacityGrid {
  const cells = new Map(capacities.map((cell) => [`${cell.binTypeId}|${cell.sku}`, cell.units]));
  return { unitsOf: (binTypeId, sku) => cells.get(`${binTypeId}|${sku}`) ?? null };
}

/** La charge d'un reste dans un type, en bacs entiers ; `null` s'il ne contient pas tout. */
export function loadIn(
  items: readonly PackedItem[],
  binTypeId: string,
  grid: CapacityGrid,
): number | null {
  let load = 0;
  for (const item of items) {
    const units = grid.unitsOf(binTypeId, item.sku);
    if (units === null) {
      return null;
    }
    load += item.quantity / units;
  }
  return load;
}

/** Colise un groupe ; rend ses bacs dans l'ordre où ils ont été remplis. */
export function packGroup(
  items: readonly PackedItem[],
  types: readonly PackingBinType[],
  grid: CapacityGrid,
): readonly BinSlot[] {
  let remaining: readonly PackedItem[] = items.filter((item) => item.quantity > 0);
  const slots: BinSlot[] = [];
  while (remaining.length > 0) {
    const last = lastBinFor(remaining, types, grid);
    if (last !== null) {
      slots.push({
        ...fill(remaining, last.type.id, last.half ? HALF_BIN : 1, grid).slot,
        half: last.half,
      });
      break;
    }
    const type = bulkTypeFor(remaining, types, grid);
    if (type === null) {
      break;
    }
    const filled = fill(remaining, type.id, 1, grid);
    slots.push(filled.slot);
    remaining = filled.remaining;
  }
  return slots;
}

/** Le plus petit bac (ou la plus petite moitié) qui prend TOUT le reste, ou `null`. */
function lastBinFor(
  items: readonly PackedItem[],
  types: readonly PackingBinType[],
  grid: CapacityGrid,
): { readonly type: PackingBinType; readonly half: boolean } | null {
  let best: {
    readonly type: PackingBinType;
    readonly half: boolean;
    readonly size: number;
  } | null = null;
  for (const type of types) {
    const load = loadIn(items, type.id, grid);
    if (load === null || load > 1 + EPSILON) {
      continue;
    }
    const half = type.divisible && load <= HALF_BIN + EPSILON;
    const size = half ? type.volume * HALF_BIN : type.volume;
    if (best === null || size < best.size) {
      best = { type, half, size };
    }
  }
  return best;
}

/** Le type d'un bac entier à remplir quand le reste ne tient pas dans un seul. */
function bulkTypeFor(
  items: readonly PackedItem[],
  types: readonly PackingBinType[],
  grid: CapacityGrid,
): PackingBinType | null {
  let best: {
    readonly type: PackingBinType;
    readonly bins: number;
    readonly volume: number;
  } | null = null;
  for (const type of types) {
    const load = loadIn(items, type.id, grid);
    if (load === null) {
      continue;
    }
    const bins = Math.ceil(load - EPSILON);
    const volume = bins * type.volume;
    if (best === null || bins < best.bins || (bins === best.bins && volume < best.volume)) {
      best = { type, bins, volume };
    }
  }
  return best?.type ?? widestTypeFor(items, types, grid);
}

/** Aucun type ne contient tout : celui qui contient le plus de produits restants. */
function widestTypeFor(
  items: readonly PackedItem[],
  types: readonly PackingBinType[],
  grid: CapacityGrid,
): PackingBinType | null {
  let best: { readonly type: PackingBinType; readonly covered: number } | null = null;
  for (const type of types) {
    const covered = items.filter((item) => grid.unitsOf(type.id, item.sku) !== null).length;
    if (covered > 0 && (best === null || covered > best.covered)) {
      best = { type, covered };
    }
  }
  return best?.type ?? null;
}

/** Remplit un bac offrant `room` (1 ou 0,5), produit par produit, dans l'ordre du reste. */
function fill(
  items: readonly PackedItem[],
  binTypeId: string,
  room: number,
  grid: CapacityGrid,
): { readonly slot: BinSlot; readonly remaining: readonly PackedItem[] } {
  let free = room;
  const content: PackedItem[] = [];
  const remaining: PackedItem[] = [];
  for (const item of items) {
    const units = grid.unitsOf(binTypeId, item.sku);
    const taken =
      units === null ? 0 : Math.min(item.quantity, Math.floor((free + EPSILON) * units));
    if (taken > 0 && units !== null) {
      content.push({ sku: item.sku, quantity: taken });
      free -= taken / units;
    }
    if (item.quantity > taken) {
      remaining.push({ sku: item.sku, quantity: item.quantity - taken });
    }
  }
  return {
    slot: { binTypeId, half: false, load: Math.max(0, room - free), content },
    remaining,
  };
}
