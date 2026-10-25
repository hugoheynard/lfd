import { instantToLocal, localToInstant } from '@lfd/contracts';
import type {
  DaySupervisionView,
  FulfillmentMethod,
  HandoverQueueEntryView,
  HandoverQueueRoundView,
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
  /**
   * « 7 h 15 », « avant 7 h 30 » pour l'échéance d'une livraison, ou `null`
   * sans heure promise (heure d'ouverture d'un retrait, sans créneau).
   */
  readonly time: string | null;
  readonly totalUnits: number;
  readonly pickupLabel: string | null;
  /** « Remis 7 h 04 » — `null` si l'heure est illisible. */
  readonly handedOverAt: string | null;
  /** « Prête depuis 6 h 48 » — l'heure où le sac a été déclaré prêt, `null` sinon. */
  readonly readyAt: string | null;
  /** Minutes de dépassement, pour « créneau dépassé de 55 min ». */
  readonly overdueMinutes: number | null;
  /**
   * **Qui** a dépassé le créneau (Hugo, 2026-09-28) — `null` hors dépassement.
   *
   * - `kitchen` : le sac n'était pas prêt à la fin du créneau — il ne l'est
   *   toujours pas, ou il l'a été APRÈS. C'est nous.
   * - `customer` : prêt à temps, et le client n'est pas venu.
   *
   * Tranché par `readyAt` contre la fin du créneau, deux faits que la file
   * porte déjà : aucun nouveau champ serveur.
   */
  readonly overdueCause: OverdueCause | null;
  readonly method: FulfillmentMethod;
  /**
   * Retenue par un contrôle qualité : le scan la refusera (`plan-controle-qualite.md`,
   * D4, D7). Lu tel quel dans la file — jamais `true` sur une retirée ou une annulée.
   */
  readonly heldForQuality: boolean;
  /**
   * La tournée d'une LIVRAISON (Hugo, 2026-10-25) : « Kangoo blanc · arrêt 3 ·
   * départ prévu 6 h 45 », ou « Pas encore dans une tournée ». `null` au retrait.
   */
  readonly roundLine: string | null;
  /** Partie à — « 7 h 02 » —, ou `null` tant que la tournée est au dépôt. */
  readonly departedAt: string | null;
  /** Un bac de l'arrêt est chargé dans la camionnette. */
  readonly loaded: boolean;
}

export type OverdueCause = 'kitchen' | 'customer';

/**
 * `deadline` : l'échéance d'une livraison, « avant 7 h 30 » (Hugo,
 * 2026-10-25). Une livraison n'a pas de début : la ranger par heure
 * d'ouverture la mettait toute dans « Heure d'ouverture », sans heure.
 */
export type SlotKind = 'hour' | 'deadline' | 'opening' | 'none';

export interface SlotGroup {
  readonly key: string;
  readonly kind: SlotKind;
  /** « 7 h – 8 h », « Avant 7 h 30 », « Heure d'ouverture », « Sans créneau ». */
  readonly label: string;
  /** Hors annulées. */
  readonly expected: number;
  readonly handedOver: number;
  /** Fin de la tranche ou échéance, en minutes du jour — `null` sinon. */
  readonly endMinutes: number | null;
  readonly rows: readonly SlotRow[];
}

/**
 * **Où en est la journée** (Supervision v2, A8) : l'heure de lecture du
 * serveur (`asOf`), rapportée au jour montré. Un autre jour n'a pas de repère
 * « Maintenant » : `minutes` vaut alors ±∞, tout est passé ou tout est à venir.
 */
export interface SlotClock {
  readonly minutes: number;
  /** « 7 h 55 », ou `null` quand le jour montré n'est pas celui de la lecture. */
  readonly label: string | null;
}

export interface HandoverBoard {
  readonly pickup: readonly SlotGroup[];
  readonly delivery: readonly SlotGroup[];
  /** Attendues = ni retirées ni annulées — les comptes du segmenté et de l'en-tête. */
  readonly pickupExpected: number;
  readonly deliveryExpected: number;
  /** Créneaux dépassés — la pastille sur l'onglet Retrait. */
  readonly overdue: number;
  /** Dont ceux que NOUS avons dépassés — le sac n'était pas prêt à temps. */
  readonly overdueKitchen: number;
  /** Attendues mais pas encore prêtes — ce que le colisage retient (Hugo, 2026-09-28). */
  readonly awaitingPacking: number;
  /** Retenues par un contrôle qualité — la pastille « N commandes retenues ». */
  readonly held: number;
  /** Absente si `supervision/day` a échoué : ni repère, ni tranche terminée. */
  readonly clock?: SlotClock | undefined;
}

export const MINUTES_PER_HOUR = 60;
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

/** Prêt avant la fin du créneau : c'est le client. Sinon — ou illisible —, c'est nous. */
export function causeOf(entry: HandoverQueueEntryView, day: string, end: string): OverdueCause {
  const due = localToInstant(day, end);
  const ready = entry.readyAt === null ? Number.NaN : new Date(entry.readyAt).getTime();
  // Illisible ⇒ « nous » : dans le doute, le retard se regarde chez soi.
  return due !== null && !Number.isNaN(ready) && ready <= due.getTime() ? 'customer' : 'kitchen';
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
    // L'enseigne d'abord, comme le colisage : la raison sociale (« SAS Refuge du
    // Fond ») ne se dit qu'à défaut d'enseigne.
    customerLabel: entry.tradeName ?? entry.customerLabel,
    state,
    time: timeOf(entry),
    totalUnits: entry.totalUnits,
    pickupLabel: entry.pickupLabel,
    handedOverAt: entry.handedOverAt === null ? null : clockLabel(entry.handedOverAt),
    readyAt: entry.readyAt === null ? null : clockLabel(entry.readyAt),
    overdueMinutes:
      state === 'overdue' && window !== null && late !== null
        ? overdueMinutesOf(day, window.end, late.asOf)
        : null,
    overdueCause: state === 'overdue' && window !== null ? causeOf(entry, day, window.end) : null,
    method: entry.fulfillmentMethod,
    heldForQuality: entry.heldForQuality,
    roundLine: roundLineOf(entry),
    departedAt:
      entry.round?.departedAt === undefined || entry.round.departedAt === null
        ? null
        : clockLabel(entry.round.departedAt),
    loaded: entry.round?.loaded ?? false,
  };
}

/**
 * La clé de rangement d'une livraison : son échéance (`d07:30`) quand elle n'a
 * pas de début, sinon la tranche de son début, comme un retrait — quelle que
 * soit la provenance du créneau : une livraison n'a pas d'heure d'ouverture.
 */
function deliveryKeyOf(entry: HandoverQueueEntryView): string {
  const window = entry.window;
  if (window === null) {
    return 'none';
  }
  if (window.start === null) {
    return minutesOf(window.end) === null ? 'none' : `d${window.end.slice(0, 5)}`;
  }
  const hour = hourOf(entry);
  return hour === null ? 'none' : `h${String(hour).padStart(2, '0')}`;
}

/** L'heure affichée : promise au retrait, échéance ou début à la livraison. */
function timeOf(entry: HandoverQueueEntryView): string | null {
  const window = entry.window;
  if (window === null) {
    return null;
  }
  if (entry.fulfillmentMethod === 'delivery') {
    return window.start === null
      ? `avant ${slotTimeLabel(window.end)}`
      : slotTimeLabel(window.start);
  }
  return slotKindOf(entry) === 'hour' ? slotTimeLabel(window.start ?? window.end) : null;
}

/** Une livraison qu'aucune tournée ne porte encore. */
export const UNPLACED_LINE = 'Pas encore dans une tournée';

/** La ligne de tournée d'une livraison — `null` au retrait, qui n'en a pas. */
function roundLineOf(entry: HandoverQueueEntryView): string | null {
  if (entry.fulfillmentMethod !== 'delivery') {
    return null;
  }
  const round: HandoverQueueRoundView | null = entry.round ?? null;
  if (round === null) {
    return UNPLACED_LINE;
  }
  const place = `${round.label} · arrêt ${String(round.position)}`;
  const planned =
    round.departedAt === null && round.plannedDepartureAt !== null
      ? clockLabel(round.plannedDepartureAt)
      : null;
  return planned === null ? place : `${place} · départ prévu ${planned}`;
}

function groupKeyOf(entry: HandoverQueueEntryView): string {
  if (entry.fulfillmentMethod === 'delivery') {
    return deliveryKeyOf(entry);
  }
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
  if (key.startsWith('d')) {
    return { kind: 'deadline', label: `Avant ${slotTimeLabel(key.slice(1))}` };
  }
  const hour = Number(key.slice(1));
  return { kind: 'hour', label: `${String(hour)} h – ${String(hour + 1)} h` };
}

/** Une tranche, ses comptes recalculés sur les lignes qu'on lui donne. */
export function groupOf(key: string, rows: readonly SlotRow[]): SlotGroup {
  const { kind, label } = labelOf(key);
  return {
    key,
    kind,
    label,
    expected: rows.filter((row) => row.state !== 'cancelled').length,
    handedOver: rows.filter((row) => row.state === 'handed_over').length,
    endMinutes: endMinutesOf(key, kind),
    rows,
  };
}

function endMinutesOf(key: string, kind: SlotKind): number | null {
  if (kind === 'hour') {
    return (Number(key.slice(1)) + 1) * MINUTES_PER_HOUR;
  }
  return kind === 'deadline' ? minutesOf(key.slice(1)) : null;
}

/**
 * Le rang d'une clé dans la journée, en minutes : une tranche par son début,
 * une échéance par elle-même ; l'heure d'ouverture puis le sans-créneau en fin.
 */
function rankOf(key: string): number {
  if (key === 'opening') {
    return Number.MAX_SAFE_INTEGER - 1;
  }
  if (key.startsWith('h')) {
    return Number(key.slice(1)) * MINUTES_PER_HOUR;
  }
  if (key.startsWith('d')) {
    return minutesOf(key.slice(1)) ?? Number.MAX_SAFE_INTEGER;
  }
  return Number.MAX_SAFE_INTEGER;
}

/** Les tranches et échéances dans l'ordre du jour, puis l'heure d'ouverture, puis sans créneau. */
function groupsOf(rows: readonly { key: string; row: SlotRow }[]): SlotGroup[] {
  const keys = [...new Set(rows.map(({ key }) => key))].sort((a, b) => rankOf(a) - rankOf(b));
  // Ce qui attend d'abord, ce qui est remis ou annulé en bas — visible, pas
  // retiré (Hugo, 2026-09-28). Tri stable : l'ordre du serveur tient dedans.
  return keys.map((key) =>
    groupOf(
      key,
      rows
        .filter((entry) => entry.key === key)
        .map(({ row }) => row)
        .sort((a, b) => Number(!isExpected(a)) - Number(!isExpected(b))),
    ),
  );
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
    overdueKitchen: all.filter((row) => row.overdueCause === 'kitchen').length,
    awaitingPacking: all.filter((row) => row.state === 'not_ready').length,
    held: all.filter((row) => row.heldForQuality).length,
    ...(late === null ? {} : { clock: clockOf(queue.day, late.asOf) }),
  };
}

/** L'heure de lecture rapportée au jour montré ; `undefined` si elle est illisible. */
export function clockOf(day: string, asOf: string): SlotClock | undefined {
  const instant = new Date(asOf);
  if (Number.isNaN(instant.getTime())) {
    return undefined;
  }
  const local = instantToLocal(instant);
  if (local.day !== day) {
    return { minutes: local.day > day ? Infinity : -Infinity, label: null };
  }
  return { minutes: minutesOf(local.time) ?? 0, label: clockLabel(asOf) };
}
