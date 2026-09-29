import {
  type BinSlot,
  capacityGrid,
  type CapacityGrid,
  HALF_BIN,
  packGroup,
} from "./pack-group.js";

/**
 * **Le colisage proposé d'une commande** (plan de tournée, lot 4 bis, L4b-C4,
 * v2-3) — une fonction PURE : ni horloge, ni base, ni aléa. Mêmes entrées,
 * même proposition.
 *
 * La règle de place est unique : une unité occupe `1 / contenance(type, sku)`
 * d'un bac entier ; une moitié offre 0,5. Le froid ne se mélange pas au sec :
 * trois groupes se colisent séparément —
 *
 * 1. le **froid**, dans les types isothermes seulement ;
 * 2. le **sec**, dans les types non isothermes ;
 * 3. le sec qu'AUCUN type non isotherme ne contient, en isotherme — plutôt que
 *    de le laisser sans bac.
 *
 * Un produit sans contenance est SIGNALÉ, jamais deviné (L4b-C2).
 */

/** Une ligne à placer (fusionnée par SKU). */
export interface PackingLine {
  readonly sku: string;
  readonly quantity: number;
  readonly requiresCold: boolean;
}

/** Un type EN SERVICE, dans l'ordre du catalogue (qui départage les égalités). */
export interface PackingBinType {
  readonly id: string;
  /** Un volume comparable entre types (le volume intérieur) : le départage à nombre de bacs égal. */
  readonly volume: number;
  readonly isotherm: boolean;
  readonly divisible: boolean;
}

/** Une case de la grille : un bac ENTIER de ce type contient `units` unités. */
export interface PackingCapacity {
  readonly binTypeId: string;
  readonly sku: string;
  readonly units: number;
}

/** Une quantité d'un produit. */
export interface PackedItem {
  readonly sku: string;
  readonly quantity: number;
}

/** Des bacs d'UN type, pour UN groupe — la forme d'une déclaration. */
export interface PackedBins {
  readonly binTypeId: string;
  readonly cold: boolean;
  readonly whole: number;
  readonly half: boolean;
  /** Remplissage du dernier bac, rapporté à ce qu'il offre (une moitié pleine = 1). */
  readonly lastFill: number;
  /** Le contenu du dernier bac — « le reste » qu'un partage pourrait prendre. */
  readonly lastContent: readonly PackedItem[];
  readonly content: readonly PackedItem[];
}

export type UnplacedReason = "no_capacity" | "cold_without_isotherm";

export interface UnplacedItem extends PackedItem {
  readonly reason: UnplacedReason;
}

export interface PackingProposal {
  readonly bins: readonly PackedBins[];
  readonly unplaced: readonly UnplacedItem[];
}

/** Les lignes réparties en groupes qui ne partagent jamais un bac. */
interface Groups {
  readonly cold: PackedItem[];
  readonly dry: PackedItem[];
  readonly dryInIsotherm: PackedItem[];
  readonly unplaced: UnplacedItem[];
}

/** Propose le colisage d'une commande. */
export function proposePacking(
  lines: readonly PackingLine[],
  types: readonly PackingBinType[],
  capacities: readonly PackingCapacity[],
): PackingProposal {
  const grid = capacityGrid(capacities);
  const isotherm = types.filter((type) => type.isotherm);
  const dry = types.filter((type) => !type.isotherm);
  const groups = sortIntoGroups(mergeLines(lines), { isotherm, dry }, grid);
  return {
    bins: [
      ...binsOf(packGroup(groups.cold, isotherm, grid), true),
      ...binsOf(packGroup(groups.dry, dry, grid), false),
      ...binsOf(packGroup(groups.dryInIsotherm, isotherm, grid), false),
    ],
    unplaced: groups.unplaced,
  };
}

/** Fusionne les lignes d'un même SKU (froid si l'une l'est), triées par SKU. Les quantités nulles tombent. */
export function mergeLines(lines: readonly PackingLine[]): readonly PackingLine[] {
  const merged = new Map<string, PackingLine>();
  for (const line of lines) {
    if (line.quantity <= 0) {
      continue;
    }
    const known = merged.get(line.sku);
    merged.set(line.sku, {
      sku: line.sku,
      quantity: (known?.quantity ?? 0) + line.quantity,
      requiresCold: (known?.requiresCold ?? false) || line.requiresCold,
    });
  }
  return [...merged.values()].sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));
}

function sortIntoGroups(
  lines: readonly PackingLine[],
  types: { readonly isotherm: readonly PackingBinType[]; readonly dry: readonly PackingBinType[] },
  grid: CapacityGrid,
): Groups {
  const groups: Groups = { cold: [], dry: [], dryInIsotherm: [], unplaced: [] };
  const fits = (sku: string, among: readonly PackingBinType[]): boolean =>
    among.some((type) => grid.unitsOf(type.id, sku) !== null);
  for (const { sku, quantity, requiresCold } of lines) {
    const item = { sku, quantity };
    if (requiresCold && fits(sku, types.isotherm)) {
      groups.cold.push(item);
    } else if (requiresCold) {
      groups.unplaced.push({ ...item, reason: "cold_without_isotherm" });
    } else if (fits(sku, types.dry)) {
      groups.dry.push(item);
    } else if (fits(sku, types.isotherm)) {
      groups.dryInIsotherm.push(item);
    } else {
      groups.unplaced.push({ ...item, reason: "no_capacity" });
    }
  }
  return groups;
}

/** Regroupe les bacs d'un groupe par type, dans l'ordre d'apparition des types. */
function binsOf(slots: readonly BinSlot[], cold: boolean): readonly PackedBins[] {
  const byType = new Map<string, BinSlot[]>();
  for (const slot of slots) {
    const list = byType.get(slot.binTypeId) ?? [];
    list.push(slot);
    byType.set(slot.binTypeId, list);
  }
  return [...byType.entries()].map(([binTypeId, list]) => {
    // La moitié, s'il y en a une, est posée en dernier : c'est « le reste ».
    const ordered = [...list.filter((slot) => !slot.half), ...list.filter((slot) => slot.half)];
    const last = ordered[ordered.length - 1];
    return {
      binTypeId,
      cold,
      whole: ordered.filter((slot) => !slot.half).length,
      half: ordered.some((slot) => slot.half),
      lastFill: last === undefined ? 0 : last.load / (last.half ? HALF_BIN : 1),
      lastContent: last?.content ?? [],
      content: sumContents(ordered),
    };
  });
}

function sumContents(slots: readonly BinSlot[]): readonly PackedItem[] {
  const totals = new Map<string, number>();
  for (const slot of slots) {
    for (const item of slot.content) {
      totals.set(item.sku, (totals.get(item.sku) ?? 0) + item.quantity);
    }
  }
  return [...totals.entries()].map(([sku, quantity]) => ({ sku, quantity }));
}
