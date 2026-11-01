import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';
import type {
  OrderSaleUnit,
  ProductionDueThresholdsView,
  ProductionWorksheetView,
} from '@lfd/contracts';

import { minutesOf, type SlotState, slots } from '../fiche-atelier/workshop-deadlines';
import { beforeFirstLabel } from './due-thresholds-section/due-thresholds-section';

/**
 * **La grille d'une journée par tranche** — produits en lignes, tranches en
 * colonnes (décision de Hugo, 2026-11-01).
 *
 * Deux lectures se croisent : le compte à rebours (`due-thresholds`, CUMULÉ,
 * qu'on décumule ici) dit ce qu'il faut sortir dans chaque tranche ; la fiche
 * d'atelier dit le rayon, l'unité et — le jour même ou passé — ce qui est
 * sorti, avec les états et les mots de la vue par tranche (`slots()`).
 *
 * Fonctions pures. « Maintenant » vient de l'appelant ; `null` = jour à venir,
 * la grille ne montre alors que des quantités.
 */

/** `deadline` : une heure ; `day` : la journée sans heure réglée ; `undated` : sans échéance. */
export type TrancheColumnKind = 'deadline' | 'day' | 'undated';

export interface TrancheColumn {
  readonly key: string;
  readonly kind: TrancheColumnKind;
  /** `HH:mm`, ou `null` hors `deadline`. */
  readonly before: string | null;
  /** « avant 05:00 », « Dans la journée », « Sans heure ». */
  readonly label: string;
  /** L'état de la tranche ; `null` pour un jour à venir ou sans fiche. */
  readonly state: SlotState | null;
  /** « Dépassée · 11 min », « La prochaine », « À venir », « Tenue ». */
  readonly stateLabel: string | null;
}

export interface TrancheCell {
  /** Ce qu'il faut sortir DANS cette tranche — pas le cumul. */
  readonly quantity: number;
  /** « 120 », ou « 1,25 kg » au poids. */
  readonly label: string;
  /** Ce qui est sorti pour ce palier ; `null` = pas de « sorti » à montrer. */
  readonly got: number | null;
  /** « 80 / 120 » ; `null` quand `got` l'est. */
  readonly progress: string | null;
  readonly state: SlotState | null;
  readonly stateLabel: string | null;
  /** « 120 attendus à 04:30, avant la première tranche », à signaler. */
  readonly beforeFirst: string | null;
}

export interface TrancheRow {
  readonly sku: string;
  readonly productName: string;
  /** `null` = la fiche ne connaît pas ce produit : son unité est inconnue. */
  readonly saleUnit: OrderSaleUnit | null;
  readonly totalLabel: string;
  /** Alignées sur les colonnes ; `null` = rien dans cette tranche. */
  readonly cells: readonly (TrancheCell | null)[];
}

export interface TrancheGroup {
  /** Le rayon de la fiche ; `null` = pas de rayon connu (fiche illisible). */
  readonly label: string | null;
  readonly rows: readonly TrancheRow[];
}

/** La charge d'une colonne : pièces et poids ne s'additionnent JAMAIS. */
export interface TrancheLoad {
  readonly pieces: number;
  readonly grams: number;
}

export interface TrancheGrid {
  readonly columns: readonly TrancheColumn[];
  readonly groups: readonly TrancheGroup[];
  /** Alignées sur les colonnes. */
  readonly loads: readonly TrancheLoad[];
  readonly total: TrancheLoad;
  /** Des produits sans unité connue, hors des deux totaux. */
  readonly unknownUnit: number;
}

/** Les mots de la vue par tranche (`worksheet-slots`), sans les minutes. */
export function slotStateLabel(state: SlotState, lateBy = 0): string {
  switch (state) {
    case 'over':
      return lateBy > 0 ? `Dépassée · ${String(lateBy)} min` : 'Dépassée';
    case 'next':
      return 'La prochaine';
    case 'met':
      return 'Tenue';
    case 'upcoming':
      return 'À venir';
  }
}

const DAY_KEY = 'day';
const UNDATED_KEY = 'undated';
/** Les produits que la fiche ne range pas, après tous les rayons. */
const UNSHELVED_LABEL = 'Hors fiche';

function columnKeyOf(kind: string, before: string | null): string {
  if (kind === 'undated') {
    return UNDATED_KEY;
  }
  return before === null ? DAY_KEY : before;
}

function columnRank(key: string): number {
  if (key === UNDATED_KEY) {
    return Number.POSITIVE_INFINITY;
  }
  return key === DAY_KEY ? Number.MAX_SAFE_INTEGER : minutesOf(key);
}

function columnLabel(key: string): string {
  if (key === UNDATED_KEY) {
    return 'Sans heure';
  }
  return key === DAY_KEY ? 'Dans la journée' : `avant ${key}`;
}

/**
 * Ce qu'il faut sortir dans chaque tranche, par produit : le cumul du seuil
 * moins celui du précédent. Deux seuils de la même colonne s'additionnent.
 */
export function decumulated(
  view: ProductionDueThresholdsView,
): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const result = new Map<string, Map<string, number>>();
  for (const line of view.lines) {
    const cells = new Map<string, number>();
    let previous = 0;
    for (const threshold of line.thresholds) {
      const key = columnKeyOf(threshold.kind, threshold.before);
      const quantity = Math.max(0, threshold.cumulative - previous);
      previous = Math.max(previous, threshold.cumulative);
      cells.set(key, (cells.get(key) ?? 0) + quantity);
    }
    result.set(line.sku, cells);
  }
  return result;
}

/** Les colonnes qui portent au moins une quantité, dans l'ordre des heures. */
export function trancheColumnKeys(
  cells: ReadonlyMap<string, ReadonlyMap<string, number>>,
): readonly string[] {
  const keys = new Set<string>();
  for (const byColumn of cells.values()) {
    for (const [key, quantity] of byColumn) {
      if (quantity > 0) {
        keys.add(key);
      }
    }
  }
  return [...keys].sort((a, b) => columnRank(a) - columnRank(b));
}

interface Progress {
  readonly got: number;
  readonly state: SlotState;
}

interface WorksheetReading {
  /** sku → (colonne → sorti et état). La clé `null` de la fiche = sans heure. */
  readonly progress: ReadonlyMap<string, ReadonlyMap<string | null, Progress>>;
  readonly columnStates: ReadonlyMap<string | null, { state: SlotState; lateBy: number }>;
}

function readWorksheet(worksheet: ProductionWorksheetView, now: number): WorksheetReading {
  const lines = worksheet.groups.flatMap((group) => group.lines);
  const progress = new Map<string, Map<string | null, Progress>>();
  const columnStates = new Map<string | null, { state: SlotState; lateBy: number }>();
  for (const slot of slots(lines, now)) {
    columnStates.set(slot.before, { state: slot.state, lateBy: slot.lateBy });
    for (const row of slot.rows) {
      const bySlot = progress.get(row.line.sku) ?? new Map<string | null, Progress>();
      bySlot.set(slot.before, {
        got: row.got,
        state: row.missing === 0 ? 'met' : slot.state,
      });
      progress.set(row.line.sku, bySlot);
    }
  }
  return { progress, columnStates };
}

/** La colonne sans heure de la grille (`day` ou `undated`) se lit au palier `null` de la fiche. */
function slotKeyOf(columnKey: string): string | null {
  return columnKey === DAY_KEY || columnKey === UNDATED_KEY ? null : columnKey;
}

function cellOf(
  quantity: number,
  unit: OrderSaleUnit | null,
  progress: Progress | undefined,
  beforeFirst: string | null,
): TrancheCell {
  const label = saleQuantityLabel(quantity, unit ?? undefined);
  return {
    quantity,
    label,
    got: progress?.got ?? null,
    progress:
      progress === undefined
        ? null
        : `${saleQuantityLabel(progress.got, unit ?? undefined)} / ${label}`,
    state: progress?.state ?? null,
    stateLabel: progress === undefined ? null : slotStateLabel(progress.state),
    beforeFirst,
  };
}

/** Les rayons de la fiche : sku → rayon, unité et rang du rayon. */
function shelvesOf(
  worksheet: ProductionWorksheetView | null,
): ReadonlyMap<string, { label: string; rank: number; unit: OrderSaleUnit }> {
  const result = new Map<string, { label: string; rank: number; unit: OrderSaleUnit }>();
  worksheet?.groups.forEach((group, rank) => {
    for (const line of group.lines) {
      result.set(line.sku, { label: group.label, rank, unit: line.saleUnit });
    }
  });
  return result;
}

/**
 * La grille entière. `worksheet` donne les rayons, l'unité et le sorti ;
 * absente (illisible), la grille reste juste, mais rangée par nom, sans
 * rayon, et ses produits d'unité inconnue sortent des totaux.
 */
export function dayTrancheGrid(
  view: ProductionDueThresholdsView,
  worksheet: ProductionWorksheetView | null,
  now: number | null,
): TrancheGrid {
  const cells = decumulated(view);
  const keys = trancheColumnKeys(cells);
  const reading = worksheet !== null && now !== null ? readWorksheet(worksheet, now) : null;
  const shelves = shelvesOf(worksheet);

  const columns: TrancheColumn[] = keys.map((key) => {
    const slotState = reading?.columnStates.get(slotKeyOf(key));
    return {
      key,
      kind: key === UNDATED_KEY ? 'undated' : key === DAY_KEY ? 'day' : 'deadline',
      before: key === UNDATED_KEY || key === DAY_KEY ? null : key,
      label: columnLabel(key),
      state: slotState?.state ?? null,
      stateLabel:
        slotState === undefined ? null : slotStateLabel(slotState.state, slotState.lateBy),
    };
  });

  const loads = keys.map((): { pieces: number; grams: number } => ({ pieces: 0, grams: 0 }));
  let unknownUnit = 0;
  const byGroup = new Map<string | null, { rank: number; rows: TrancheRow[] }>();

  for (const line of view.lines) {
    const shelf = shelves.get(line.sku);
    const unit = shelf?.unit ?? null;
    const progress = reading?.progress.get(line.sku);
    const byColumn = cells.get(line.sku) ?? new Map<string, number>();
    const early = beforeFirstLabel(line.thresholds);
    const firstEarly = line.thresholds.find((threshold) => threshold.kind === 'before_first');
    const row: TrancheRow = {
      sku: line.sku,
      productName: line.productName,
      saleUnit: unit,
      totalLabel: saleQuantityLabel(line.total, unit ?? undefined),
      cells: keys.map((key, index) => {
        const quantity = byColumn.get(key) ?? 0;
        if (quantity === 0) {
          return null;
        }
        const load = loads[index];
        if (load !== undefined && unit === 'piece') {
          load.pieces += quantity;
        } else if (load !== undefined && unit === 'weight') {
          load.grams += quantity;
        }
        const flagged = firstEarly !== undefined && firstEarly.before === key ? early : null;
        return cellOf(quantity, unit, progress?.get(slotKeyOf(key)), flagged);
      }),
    };
    if (unit === null) {
      unknownUnit += 1;
    }
    const groupKey = worksheet === null ? null : (shelf?.label ?? UNSHELVED_LABEL);
    const group = byGroup.get(groupKey) ?? {
      rank: shelf?.rank ?? Number.POSITIVE_INFINITY,
      rows: [],
    };
    group.rows.push(row);
    byGroup.set(groupKey, group);
  }

  const groups = [...byGroup.entries()]
    .sort(([, a], [, b]) => a.rank - b.rank)
    .map(([label, group]) => ({
      label,
      rows: [...group.rows].sort((a, b) => a.productName.localeCompare(b.productName, 'fr')),
    }));

  return {
    columns,
    groups,
    loads,
    total: loads.reduce(
      (sum, load) => ({ pieces: sum.pieces + load.pieces, grams: sum.grams + load.grams }),
      { pieces: 0, grams: 0 },
    ),
    unknownUnit,
  };
}
