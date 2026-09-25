import { localToInstant } from '@lfd/contracts';
import type {
  DaySupervisionView,
  FulfillmentMethod,
  HandoverQueueEntryView,
  HandoverQueueView,
} from '@lfd/contracts';

import { minutesOf } from './packing-cards';
import { clockLabel, slotTimeLabel } from './supervision-labels';

/**
 * **La colonne 3 — l'unité est le créneau.** La file de retrait, groupée par
 * tranche horaire du créneau convenu (plan §5).
 *
 * 🔴 Le **verdict** « créneau dépassé » vient de `supervision/day`, jamais
 * recalculé ici : les règles de retard vivent au serveur. Seule la **durée**
 * affichée se calcule à l'écran (`asOf − fin du créneau`), `LateOrder` n'en
 * portant pas.
 */
export type SlotRowState = 'handed_over' | 'overdue' | 'cancelled' | 'not_ready' | 'ready';

export interface SlotRow {
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  readonly state: SlotRowState;
  /** « 7 h 15 », ou `null` sans heure promise (heure d'ouverture, sans créneau). */
  readonly time: string | null;
  readonly totalUnits: number;
  readonly pickupLabel: string | null;
  /** « Retirée à 7 h 04 » — `null` si l'heure est illisible. */
  readonly handedOverAt: string | null;
  /** Minutes de dépassement, pour « créneau dépassé de 55 min ». */
  readonly overdueMinutes: number | null;
  readonly method: FulfillmentMethod;
}

export type SlotKind = 'hour' | 'opening' | 'none';

export interface SlotGroup {
  readonly key: string;
  readonly kind: SlotKind;
  /** « 7 h – 8 h », « Heure d'ouverture », « Sans créneau ». */
  readonly label: string;
  /** Hors annulées. */
  readonly expected: number;
  readonly handedOver: number;
  readonly rows: readonly SlotRow[];
}

export interface HandoverBoard {
  readonly pickup: readonly SlotGroup[];
  readonly delivery: readonly SlotGroup[];
  /** Attendues = ni retirées ni annulées — les comptes du segmenté et de l'en-tête. */
  readonly pickupExpected: number;
  readonly deliveryExpected: number;
  /** Créneaux dépassés — la pastille sur l'onglet Retrait. */
  readonly overdue: number;
}

const MINUTES_PER_HOUR = 60;
const MINUTE_MS = 60_000;

/**
 * La tranche d'un créneau promis : l'heure de son début, sinon celle de sa fin
 * — une commande due « avant 8 h » tombe dans « 7 h – 8 h », pas « 8 h – 9 h ».
 */
function hourOf(entry: HandoverQueueEntryView): number | null {
  const window = entry.window;
  if (window === null) {
    return null;
  }
  if (window.start !== null) {
    const start = minutesOf(window.start);
    return start === null ? null : Math.floor(start / MINUTES_PER_HOUR);
  }
  const end = minutesOf(window.end);
  return end === null ? null : Math.floor(Math.max(0, end - 1) / MINUTES_PER_HOUR);
}

/**
 * Une heure d'ouverture recopiée n'est pas une promesse : elle a sa tranche à
 * part, et n'est jamais « en retard ». Pas de créneau du tout : « Sans créneau ».
 */
export function slotKindOf(entry: HandoverQueueEntryView): SlotKind {
  if (entry.window === null) {
    return 'none';
  }
  return entry.window.source === 'default' ? 'opening' : 'hour';
}

/** `asOf − fin du créneau`, en minutes entières ; `null` si l'un des deux est illisible. */
export function overdueMinutesOf(date: string, end: string, asOf: string): number | null {
  const due = localToInstant(date, end);
  const now = new Date(asOf).getTime();
  if (due === null || Number.isNaN(now)) {
    return null;
  }
  return Math.max(0, Math.floor((now - due.getTime()) / MINUTE_MS));
}

function stateOf(entry: HandoverQueueEntryView, overdue: boolean): SlotRowState {
  switch (entry.state) {
    case 'handed_over':
      return 'handed_over';
    case 'cancelled':
      return 'cancelled';
    case 'ready':
      return overdue ? 'overdue' : 'ready';
    case 'expected':
      return overdue ? 'overdue' : 'not_ready';
  }
}

function rowOf(
  entry: HandoverQueueEntryView,
  day: string,
  late: DaySupervisionView | null,
): SlotRow {
  // Seule la règle « après le créneau » fait un créneau DÉPASSÉ ; « pas prête
  // avant le créneau » reste « encore au colisage », que la file dit déjà.
  const overdue =
    late?.late.some(
      (order) => order.orderId === entry.orderId && order.rule === 'not_handed_over_after_window',
    ) ?? false;
  const state = stateOf(entry, overdue && slotKindOf(entry) === 'hour');
  const window = entry.window;
  return {
    orderId: entry.orderId,
    reference: entry.reference,
    customerLabel: entry.customerLabel,
    state,
    time:
      slotKindOf(entry) === 'hour' && window !== null
        ? slotTimeLabel(window.start ?? window.end)
        : null,
    totalUnits: entry.totalUnits,
    pickupLabel: entry.pickupLabel,
    handedOverAt: entry.handedOverAt === null ? null : clockLabel(entry.handedOverAt),
    overdueMinutes:
      state === 'overdue' && window !== null && late !== null
        ? overdueMinutesOf(day, window.end, late.asOf)
        : null,
    method: entry.fulfillmentMethod,
  };
}

function groupKeyOf(entry: HandoverQueueEntryView): string {
  const kind = slotKindOf(entry);
  if (kind !== 'hour') {
    return kind;
  }
  const hour = hourOf(entry);
  return hour === null ? 'none' : `h${String(hour).padStart(2, '0')}`;
}

function labelOf(key: string): { kind: SlotKind; label: string } {
  if (key === 'opening') {
    return { kind: 'opening', label: "Heure d'ouverture" };
  }
  if (key === 'none') {
    return { kind: 'none', label: 'Sans créneau' };
  }
  const hour = Number(key.slice(1));
  return { kind: 'hour', label: `${String(hour)} h – ${String(hour + 1)} h` };
}

/** Les tranches horaires dans l'ordre du jour, puis l'heure d'ouverture, puis sans créneau. */
function groupsOf(rows: readonly { key: string; row: SlotRow }[]): SlotGroup[] {
  const keys = [...new Set(rows.map(({ key }) => key))].sort((a, b) => {
    const rank = (key: string): string => (key === 'opening' ? 'y' : key === 'none' ? 'z' : key);
    return rank(a).localeCompare(rank(b));
  });
  return keys.map((key) => {
    const inGroup = rows.filter((entry) => entry.key === key).map(({ row }) => row);
    return {
      key,
      ...labelOf(key),
      expected: inGroup.filter((row) => row.state !== 'cancelled').length,
      handedOver: inGroup.filter((row) => row.state === 'handed_over').length,
      rows: inGroup,
    };
  });
}

function isExpected(row: SlotRow): boolean {
  return row.state !== 'handed_over' && row.state !== 'cancelled';
}

/**
 * La colonne entière. `late` est facultatif : si `supervision/day` a échoué,
 * la file reste lisible, simplement sans verdict de retard.
 */
export function handoverBoard(
  queue: HandoverQueueView,
  late: DaySupervisionView | null,
): HandoverBoard {
  const rows = queue.entries.map((entry) => ({
    key: groupKeyOf(entry),
    row: rowOf(entry, queue.day, late),
  }));
  const byMethod = (method: FulfillmentMethod) => rows.filter(({ row }) => row.method === method);
  const all = rows.map(({ row }) => row);
  return {
    pickup: groupsOf(byMethod('pickup')),
    delivery: groupsOf(byMethod('delivery')),
    pickupExpected: all.filter((row) => row.method === 'pickup' && isExpected(row)).length,
    deliveryExpected: all.filter((row) => row.method === 'delivery' && isExpected(row)).length,
    overdue: all.filter((row) => row.state === 'overdue').length,
  };
}
