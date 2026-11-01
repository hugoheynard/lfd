import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';
import type {
  OrderSaleUnit,
  ProductionDueThresholdsView,
  ProductionForecastView,
  ProductionWorksheetView,
} from '@lfd/contracts';

import { minutesOf, type SlotState, slots } from '../fiche-atelier/workshop-deadlines';
import { beforeFirstLabel } from './due-thresholds-section/due-thresholds-section';

/**
 * **La grille d'une journée par tranche** — produits en lignes, tranches en
 * colonnes (décision de Hugo, 2026-11-01).
 *
 * 🔴 **Les lignes sont celles du prévisionnel**, pas celles des échéances
 * (Hugo, 2026-11-01, « il me manque des catégories ») : une première version
 * partait du compte à rebours, et tout ce qui n'a pas d'heure — réassorts,
 * pâtisserie, traiteur — disparaissait. Le total d'un produit est donc celui
 * de la colonne du jour dans la matrice ; les échéances (`due-thresholds`,
 * CUMULÉES, décumulées ici) ne font que le RÉPARTIR dans les tranches, et le
 * reste tombe dans une dernière colonne « Sans heure ». Somme des colonnes =
 * total de la matrice, par construction.
 *
 * La fiche d'atelier n'apporte que le sorti, avec les états et les mots de la
 * vue par tranche (`slots()`). Fonctions pures. « Maintenant » vient de
 * l'appelant ; `null` = jour à venir, la grille ne montre que des quantités.
 */

/** `deadline` : une heure ; `day` : la journée sans heure réglée ; `rest` : ce qu'aucune échéance ne place. */
export type TrancheColumnKind = 'deadline' | 'day' | 'rest';

export interface TrancheColumn {
  readonly key: string;
  readonly kind: TrancheColumnKind;
  /** `HH:mm`, ou `null` hors `deadline`. */
  readonly before: string | null;
  /** « avant 05:00 », « Dans la journée », « Sans heure ». */
  readonly label: string;
  /** « réassorts compris » sur la colonne du reste, quand il y en a. */
  readonly subtitle: string | null;
  /** L'état de la tranche ; `null` pour un jour à venir, sans fiche, ou le reste. */
  readonly state: SlotState | null;
  /** « Dépassée · 11 min », « La prochaine », « À venir », « Tenue ». */
  readonly stateLabel: string | null;
}

export interface TrancheCell {
  /** Ce qu'il faut sortir DANS cette tranche — pas le cumul. */
  readonly quantity: number;
  /** « 120 », ou « 1,25 kg » au poids. */
  readonly label: string;
  /** La part des réassorts dans `quantity` — seulement dans le reste. */
  readonly resupply: number;
  /** « 80 / 120 » ; `null` = pas de « sorti » à montrer. */
  readonly progress: string | null;
  readonly state: SlotState | null;
  readonly stateLabel: string | null;
  /** « 120 attendus à 04:30, avant la première tranche », à signaler. */
  readonly beforeFirst: string | null;
}

export interface TrancheRow {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: OrderSaleUnit;
  /** Le total du prévisionnel ce jour-là — la somme des cases. */
  readonly total: number;
  /** Alignées sur les colonnes ; `null` = rien dans cette tranche. */
  readonly cells: readonly (TrancheCell | null)[];
  /**
   * Les échéances dépassent le prévisionnel (sources désynchronisées) : rien
   * n'est réparti, tout le total reste « Sans heure », et la ligne le dit.
   */
  readonly mismatch: string | null;
}

/** La charge d'une colonne : pièces et poids ne s'additionnent JAMAIS. */
export interface TrancheLoad {
  readonly pieces: number;
  readonly grams: number;
  /** La part des réassorts, en unités du prévisionnel. */
  readonly resupply: number;
}

export interface TrancheGrid {
  readonly columns: readonly TrancheColumn[];
  readonly rows: readonly TrancheRow[];
  /** Alignées sur les colonnes. */
  readonly loads: readonly TrancheLoad[];
  readonly total: TrancheLoad;
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
  /** sku → (palier → sorti et état). La clé `null` de la fiche = sans heure. */
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

/** La colonne « Dans la journée » se lit au palier `null` de la fiche. */
function slotKeyOf(columnKey: string): string | null {
  return columnKey === DAY_KEY ? null : columnKey;
}

const REST_KEY = 'rest';

/** Une ligne du prévisionnel, réduite au jour lu. */
interface DayLine {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: OrderSaleUnit;
  readonly total: number;
  readonly resupply: number;
}

function dayLines(forecast: ProductionForecastView, date: string): readonly DayLine[] {
  const column = forecast.days.findIndex((day) => day.date === date);
  if (column < 0) {
    return [];
  }
  return forecast.lines
    .map((line) => ({
      sku: line.sku,
      productName: line.productName,
      saleUnit: line.saleUnit,
      total: line.quantities[column] ?? 0,
      resupply: line.resupplyQuantities[column] ?? 0,
    }))
    .filter((line) => line.total > 0);
}

/** Les quantités à heure (hors `undated`) d'un produit — ce qu'on répartit. */
function timedOf(byColumn: ReadonlyMap<string, number> | undefined): ReadonlyMap<string, number> {
  return new Map(
    [...(byColumn ?? new Map<string, number>())].filter(([key]) => key !== UNDATED_KEY),
  );
}

function sumOf(values: Iterable<number>): number {
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum;
}

function progressCell(
  quantity: number,
  unit: OrderSaleUnit,
  progress: Progress | undefined,
  beforeFirst: string | null,
): TrancheCell {
  const label = saleQuantityLabel(quantity, unit);
  return {
    quantity,
    label,
    resupply: 0,
    progress: progress === undefined ? null : `${saleQuantityLabel(progress.got, unit)} / ${label}`,
    state: progress?.state ?? null,
    stateLabel: progress === undefined ? null : slotStateLabel(progress.state),
    beforeFirst,
  };
}

function restCell(quantity: number, unit: OrderSaleUnit, resupply: number): TrancheCell {
  return {
    quantity,
    label: saleQuantityLabel(quantity, unit),
    // Les réassorts n'ont pas d'échéance : leur part est toute dans le reste.
    resupply: Math.min(resupply, quantity),
    progress: null,
    state: null,
    stateLabel: null,
    beforeFirst: null,
  };
}

/**
 * La grille entière. `forecast` est la lecture du prévisionnel qui couvre
 * `date` ; `due` ne fait que répartir ; `worksheet` donne le sorti.
 */
export function dayTrancheGrid(
  forecast: ProductionForecastView,
  date: string,
  /** `null` = le compte à rebours n'a pas répondu : tout reste « Sans heure ». */
  due: ProductionDueThresholdsView | null,
  worksheet: ProductionWorksheetView | null,
  now: number | null,
): TrancheGrid {
  const lines = dayLines(forecast, date);
  const decumulatedBySku = due === null ? new Map() : decumulated(due);
  const thresholdsBySku = new Map((due?.lines ?? []).map((line) => [line.sku, line.thresholds]));
  const reading = worksheet !== null && now !== null ? readWorksheet(worksheet, now) : null;

  const plans = lines.map((line) => {
    const timed = timedOf(decumulatedBySku.get(line.sku));
    const placed = sumOf(timed.values());
    const mismatch =
      placed > line.total
        ? `Échéances au-delà du prévisionnel : ${saleQuantityLabel(placed, line.saleUnit)} pour ${saleQuantityLabel(line.total, line.saleUnit)}`
        : null;
    return {
      line,
      timed: mismatch === null ? timed : new Map<string, number>(),
      rest: mismatch === null ? line.total - placed : line.total,
      mismatch,
    };
  });

  const timedKeys = trancheColumnKeys(new Map(plans.map((plan) => [plan.line.sku, plan.timed])));
  const hasRest = plans.some((plan) => plan.rest > 0);
  const keys = hasRest ? [...timedKeys, REST_KEY] : [...timedKeys];
  const restResupply = sumOf(plans.map((plan) => Math.min(plan.line.resupply, plan.rest)));

  const columns: TrancheColumn[] = keys.map((key) => {
    if (key === REST_KEY) {
      return {
        key,
        kind: 'rest',
        before: null,
        label: 'Sans heure',
        subtitle: restResupply > 0 ? 'réassorts compris' : null,
        state: null,
        stateLabel: null,
      };
    }
    const slotState = reading?.columnStates.get(slotKeyOf(key));
    return {
      key,
      kind: key === DAY_KEY ? 'day' : 'deadline',
      before: key === DAY_KEY ? null : key,
      label: columnLabel(key),
      subtitle: null,
      state: slotState?.state ?? null,
      stateLabel:
        slotState === undefined ? null : slotStateLabel(slotState.state, slotState.lateBy),
    };
  });

  const loads = keys.map(() => ({ pieces: 0, grams: 0, resupply: 0 }));
  const rows: TrancheRow[] = plans.map(({ line, timed, rest, mismatch }) => {
    const progress = reading?.progress.get(line.sku);
    const thresholds = thresholdsBySku.get(line.sku) ?? [];
    const early = beforeFirstLabel(thresholds);
    const firstEarly = thresholds.find((threshold) => threshold.kind === 'before_first');
    const cells = keys.map((key, index) => {
      const quantity = key === REST_KEY ? rest : (timed.get(key) ?? 0);
      if (quantity <= 0) {
        return null;
      }
      const cell =
        key === REST_KEY
          ? restCell(quantity, line.saleUnit, line.resupply)
          : progressCell(
              quantity,
              line.saleUnit,
              progress?.get(slotKeyOf(key)),
              firstEarly !== undefined && firstEarly.before === key ? early : null,
            );
      const load = loads[index];
      if (load !== undefined) {
        if (line.saleUnit === 'weight') {
          load.grams += quantity;
        } else {
          load.pieces += quantity;
        }
        load.resupply += cell.resupply;
      }
      return cell;
    });
    return {
      sku: line.sku,
      productName: line.productName,
      saleUnit: line.saleUnit,
      total: line.total,
      cells,
      mismatch,
    };
  });

  return {
    columns,
    rows,
    loads,
    total: loads.reduce(
      (sum, load) => ({
        pieces: sum.pieces + load.pieces,
        grams: sum.grams + load.grams,
        resupply: sum.resupply + load.resupply,
      }),
      { pieces: 0, grams: 0, resupply: 0 },
    ),
  };
}
