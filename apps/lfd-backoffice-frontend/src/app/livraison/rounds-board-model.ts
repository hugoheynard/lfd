import type {
  DeliveryRoundDriverView,
  DeliveryRoundProposalView,
  DeliveryRunSheetStopView,
} from '@lfd/contracts';

import {
  type PlannedRound,
  type PlannedStop,
  type PlannedTiming,
  stopNameOf,
} from './delivery-planning';
import {
  broughtBackLabel,
  type ComposedDay,
  type ComposedRound,
  type ListSlot,
  type OrderLists,
  signalLabel,
  type WindowBounds,
  windowClashes,
  windowShortLabel,
} from './delivery-rounds';
import type { OrderCardEdge, OrderCardTag } from './order-card/order-card';
import { timeLabel } from '../shared/window-label';

/**
 * Le tableau de l'organisateur de tournées
 * (`handoff-tournees/SPEC.md`) : « À répartir », les tournées, et ce que la
 * carte en montre — le même modèle pour la composition enregistrée et pour
 * l'aperçu d'une proposition, pour qu'un seul écran serve les deux.
 *
 * Type-only sur le contrat, comme `delivery-rounds.ts` : une valeur importée
 * de `@lfd/contracts` tirerait zod dans le paquet de la page.
 */

/** Le nom de la liste « À répartir » parmi les listes du tableau — jamais un identifiant de tournée. */
export const POOL_KEY = '__pool__';

/**
 * Pourquoi le calcul a laissé une commande à répartir (aperçu seulement) :
 * sans point GPS, plus de passage permis, ou la place (CA4) — aucune caisse
 * ne la tient (`capacity`), ou l'on ne sait pas combien de bacs elle
 * occupera (`unknown_demand`).
 */
export type BoardReason = 'unlocated' | 'overflow' | 'capacity' | 'unknown_demand';

/** Une commande à répartir. */
export interface BoardOrder {
  readonly orderId: string;
  readonly reference: string;
  readonly sheet: DeliveryRunSheetStopView | null;
  readonly broughtBackAt: string | null;
  readonly reason: BoardReason | null;
}

/** Un arrêt d'une tournée du tableau. */
export interface BoardStop {
  readonly orderId: string;
  /** `null` : l'arrêt n'existe pas encore en base (aperçu, ou geste en vol). */
  readonly stopId: string | null;
  readonly reference: string;
  readonly sheet: DeliveryRunSheetStopView | null;
  readonly window: WindowBounds | null;
  /** C8 : la référence de l'arrêt placé avant et qui fait arriver trop tard. */
  readonly windowClash: string | null;
  /** Ce qui cloche, en toutes lettres (Q11). */
  readonly signals: readonly string[];
  readonly broughtBackAt: string | null;
  /** Placé là par le calcul — en bleu dans l'aperçu. */
  readonly proposed: boolean;
  /** Le calcul l'y fait arriver après son créneau. */
  readonly windowMissed: boolean;
}

/** Une tournée du tableau — enregistrée, ou à ouvrir dans l'aperçu. */
export interface BoardRound {
  readonly key: string;
  readonly roundId: string | null;
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly departedAt: string | null;
  readonly returnedAt: string | null;
  /** Partie, ou chargée dans l'aperçu : rien ne s'y dépose, rien n'en sort (I6). */
  readonly frozen: boolean;
  readonly vehicleRetired: boolean;
  readonly driver: DeliveryRoundDriverView | null;
  readonly geometry: readonly (readonly [number, number])[] | null;
  /**
   * Départ, retour et distance estimés — dans l'aperçu seulement. Une tournée
   * enregistrée n'en porte pas : `DeliveryRoundView` ne les sert pas (vérifié
   * le 2026-10-06), et `null` aussi tant qu'une colonne attend son chronométrage.
   */
  readonly timing: PlannedTiming | null;
  readonly stops: readonly BoardStop[];
}

/** Un geste du glisser : la commande, d'où elle part, où elle tombe. */
export interface BoardDrop {
  readonly orderId: string;
  readonly from: ListSlot;
  readonly to: ListSlot;
}

export interface Board {
  readonly rounds: readonly BoardRound[];
  readonly pool: readonly BoardOrder[];
}

/** Les tracés connus, par clé de tournée. */
export type Geometries = ReadonlyMap<string, readonly (readonly [number, number])[]>;

function withClashes(stops: readonly BoardStop[]): readonly BoardStop[] {
  const clashes = windowClashes(stops);
  return stops.map((stop, index) => ({ ...stop, windowClash: clashes[index] ?? null }));
}

function roundOfComposed(composed: ComposedRound, geometries: Geometries): BoardRound {
  const { round } = composed;
  return {
    key: round.id,
    roundId: round.id,
    vehicleId: round.vehicleId,
    vehicleName: round.vehicleName,
    passage: round.passage,
    departedAt: round.departedAt,
    returnedAt: round.returnedAt,
    frozen: round.departedAt !== null,
    vehicleRetired: round.vehicleRetired,
    driver: round.driver,
    geometry: geometries.get(round.id) ?? null,
    timing: null,
    stops: composed.stops.map(({ stop, sheet, windowClash }) => ({
      orderId: stop.orderId,
      stopId: stop.stopId,
      reference: stop.reference,
      sheet,
      window: sheet?.window ?? null,
      windowClash,
      signals: stop.signals.map((signal) => signalLabel(signal, stop.orderDay)),
      broughtBackAt: stop.broughtBackAt ?? null,
      proposed: false,
      windowMissed: false,
    })),
  };
}

/** La composition enregistrée, telle que le tableau la montre. */
export function boardOfComposed(composed: ComposedDay, geometries: Geometries = new Map()): Board {
  return {
    rounds: composed.rounds.map((round) => roundOfComposed(round, geometries)),
    pool: composed.unassigned.map(({ order, sheet }) => ({
      orderId: order.orderId,
      reference: order.reference,
      sheet,
      broughtBackAt: order.broughtBackAt ?? null,
      reason: null,
    })),
  };
}

/** Les listes du tableau : chaque tournée par sa clé, et « À répartir ». */
export function listsOf(board: Board): OrderLists {
  return {
    ...Object.fromEntries(
      board.rounds.map((round) => [round.key, round.stops.map((stop) => stop.orderId)]),
    ),
    [POOL_KEY]: board.pool.map((order) => order.orderId),
  };
}

function stopOfOrder(order: BoardOrder): BoardStop {
  return {
    orderId: order.orderId,
    stopId: null,
    reference: order.reference,
    sheet: order.sheet,
    window: order.sheet?.window ?? null,
    windowClash: null,
    signals: [],
    broughtBackAt: order.broughtBackAt,
    proposed: false,
    windowMissed: false,
  };
}

function orderOfStop(stop: BoardStop): BoardOrder {
  return {
    orderId: stop.orderId,
    reference: stop.reference,
    sheet: stop.sheet,
    broughtBackAt: stop.broughtBackAt,
    reason: null,
  };
}

/**
 * Le tableau après un geste, avant que le serveur ne l'ait confirmé : les
 * listes nommées dans `lists` prennent ces commandes, dans cet ordre. Une
 * commande inconnue du tableau est ignorée — l'écran ne l'invente pas.
 */
export function relaidBoard(board: Board, lists: OrderLists): Board {
  const stops = new Map<string, BoardStop>();
  const orders = new Map<string, BoardOrder>();
  for (const round of board.rounds) {
    for (const stop of round.stops) {
      stops.set(stop.orderId, stop);
      orders.set(stop.orderId, orderOfStop(stop));
    }
  }
  for (const order of board.pool) {
    orders.set(order.orderId, order);
    stops.set(order.orderId, stopOfOrder(order));
  }
  const rounds = board.rounds.map((round) => {
    const ids = lists[round.key];
    if (ids === undefined) {
      return round;
    }
    const placed = ids.flatMap((id) => {
      const stop = stops.get(id);
      return stop === undefined ? [] : [stop];
    });
    return { ...round, stops: withClashes(placed) };
  });
  const poolIds = lists[POOL_KEY];
  const pool =
    poolIds === undefined
      ? board.pool
      : poolIds.flatMap((id) => {
          const order = orders.get(id);
          return order === undefined ? [] : [order];
        });
  return { rounds, pool };
}

/**
 * L'aperçu d'une proposition, au format du tableau. Un arrêt est « proposé »
 * quand le calcul l'a mis là où il n'était pas : une tournée à ouvrir, ou une
 * tournée existante qui ne le portait pas.
 */
export function boardOfPlan(
  plan: readonly PlannedRound[],
  pool: readonly string[],
  composed: ComposedDay | null,
  proposal: DeliveryRoundProposalView,
): Board {
  const live = composed === null ? new Map<string, ComposedRound>() : roundsById(composed);
  const known = composed === null ? emptyBoard() : boardOfComposed(composed);
  const knownStops = new Map(
    known.rounds.flatMap((round) => round.stops.map((stop) => [stop.orderId, stop] as const)),
  );
  const rounds = plan.map((planned): BoardRound => {
    const current = planned.roundId === null ? undefined : live.get(planned.roundId);
    const before = new Set(current?.stops.map(({ stop }) => stop.orderId) ?? []);
    const stops = planned.stops.map((stop) =>
      plannedStopOnBoard(stop, knownStops.get(stop.orderId), !before.has(stop.orderId)),
    );
    return {
      key: planned.key,
      roundId: planned.roundId,
      vehicleId: planned.vehicleId,
      vehicleName: planned.vehicleName,
      passage: planned.passage,
      departedAt: current?.round.departedAt ?? null,
      returnedAt: current?.round.returnedAt ?? null,
      frozen: planned.lock !== null,
      vehicleRetired: current?.round.vehicleRetired ?? false,
      driver: current?.round.driver ?? null,
      geometry: planned.geometry,
      timing: planned.timing,
      stops: withClashes(stops),
    };
  });
  return { rounds, pool: poolOfPreview(pool, known, proposal) };
}

function plannedStopOnBoard(
  stop: PlannedStop,
  known: BoardStop | undefined,
  proposed: boolean,
): BoardStop {
  return {
    orderId: stop.orderId,
    stopId: known?.stopId ?? null,
    reference: stop.reference,
    sheet: stop.sheet,
    window: stop.window,
    windowClash: null,
    signals: known?.signals ?? [],
    broughtBackAt: known?.broughtBackAt ?? null,
    proposed,
    windowMissed: stop.windowMissed,
  };
}

function poolOfPreview(
  pool: readonly string[],
  known: Board,
  proposal: DeliveryRoundProposalView,
): readonly BoardOrder[] {
  const reasons = reasonsOf(proposal);
  const orders = new Map<string, BoardOrder>([
    ...known.pool.map((order) => [order.orderId, order] as const),
    ...known.rounds.flatMap((round) =>
      round.stops.map((stop) => [stop.orderId, orderOfStop(stop)] as const),
    ),
  ]);
  for (const ref of [...proposal.unlocated, ...proposal.overflow, ...proposal.unfit]) {
    if (!orders.has(ref.orderId)) {
      orders.set(ref.orderId, {
        orderId: ref.orderId,
        reference: ref.reference,
        sheet: null,
        broughtBackAt: null,
        reason: null,
      });
    }
  }
  return pool.flatMap((id) => {
    const order = orders.get(id);
    if (order === undefined) {
      return [];
    }
    return [{ ...order, reason: reasons.get(id) ?? null }];
  });
}

/** La raison de chaque commande que le calcul a laissée à répartir ; la première l'emporte. */
function reasonsOf(proposal: DeliveryRoundProposalView): ReadonlyMap<string, BoardReason> {
  const reasons = new Map<string, BoardReason>();
  const add = (orderId: string, reason: BoardReason): void => {
    if (!reasons.has(orderId)) {
      reasons.set(orderId, reason);
    }
  };
  proposal.unlocated.forEach((order) => add(order.orderId, 'unlocated'));
  proposal.overflow.forEach((order) => add(order.orderId, 'overflow'));
  proposal.unfit.forEach((order) => add(order.orderId, order.reason));
  return reasons;
}

function roundsById(composed: ComposedDay): Map<string, ComposedRound> {
  return new Map(composed.rounds.map((round) => [round.round.id, round]));
}

function emptyBoard(): Board {
  return { rounds: [], pool: [] };
}

/**
 * « À répartir » dans l'aperçu : ce que le calcul n'a placé nulle part — les
 * commandes connues de la composition, et celles qu'il nomme non situées ou
 * hors durée, moins celles qu'une colonne porte.
 */
export function previewPoolOf(
  plan: readonly PlannedRound[],
  composed: ComposedDay | null,
  proposal: DeliveryRoundProposalView,
): readonly string[] {
  const placed = new Set(plan.flatMap((round) => round.stops.map((stop) => stop.orderId)));
  const candidates = [
    ...(composed?.unassigned.map(({ order }) => order.orderId) ?? []),
    ...(composed?.rounds.flatMap((round) => round.stops.map(({ stop }) => stop.orderId)) ?? []),
    ...proposal.unlocated.map((order) => order.orderId),
    ...proposal.overflow.map((order) => order.orderId),
    ...proposal.unfit.map((order) => order.orderId),
  ];
  return [...new Set(candidates)].filter((id) => !placed.has(id));
}

/** Ce qui est à régler dans une tournée : fenêtres intenables et signaux (Q11). */
export function alertCountOf(round: BoardRound): number {
  return round.stops.reduce(
    (count, stop) => count + stop.signals.length + (stop.windowClash === null ? 0 : 1),
    0,
  );
}

/** Les tournées d'un véhicule, dans l'ordre servi. */
export interface VehicleGroup {
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly rounds: readonly BoardRound[];
}

/**
 * Un groupe par véhicule, dans l'ordre de leur première tournée ; ses
 * passages dans l'ordre où ils partent — l'aperçu met les tournées proposées
 * avant celles qu'il garde.
 */
export function vehicleGroupsOf(rounds: readonly BoardRound[]): readonly VehicleGroup[] {
  const groups = new Map<string, BoardRound[]>();
  for (const round of rounds) {
    const group = groups.get(round.vehicleId);
    if (group === undefined) {
      groups.set(round.vehicleId, [round]);
    } else {
      group.push(round);
    }
  }
  return [...groups.entries()].map(([vehicleId, members]) => ({
    vehicleId,
    vehicleName: members[0]?.vehicleName ?? '',
    rounds: [...members].sort((a, b) => a.passage - b.passage),
  }));
}

/**
 * Où tombe une commande lâchée sur l'onglet d'un véhicule : à la fin de son
 * DERNIER passage encore en préparation — `null` s'il n'en a aucun.
 */
export function dropTargetOf(rounds: readonly BoardRound[], vehicleId: string): BoardRound | null {
  return (
    rounds
      .filter((round) => round.vehicleId === vehicleId && !round.frozen)
      .sort((a, b) => a.passage - b.passage)
      .at(-1) ?? null
  );
}

/**
 * Les opérations qui mènent les tournées de `current` à `desired` — une
 * affectation, un déplacement ou un retrait par commande qui change de liste.
 * L'ordre DANS une tournée n'y est pas : il s'envoie ensuite, en permutation
 * entière (I2), une fois les arrêts créés.
 */
export type LayoutOp =
  | { readonly kind: 'assign'; readonly orderId: string; readonly to: string }
  | { readonly kind: 'move'; readonly orderId: string; readonly from: string; readonly to: string }
  | { readonly kind: 'remove'; readonly orderId: string; readonly from: string };

export function layoutOps(current: OrderLists, desired: OrderLists): readonly LayoutOp[] {
  const where = new Map<string, string>();
  for (const [key, ids] of Object.entries(current)) {
    for (const id of ids) {
      where.set(id, key);
    }
  }
  const wanted = new Map<string, string>();
  for (const [key, ids] of Object.entries(desired)) {
    for (const id of ids) {
      wanted.set(id, key);
    }
  }
  const ops: LayoutOp[] = [];
  for (const [orderId, to] of wanted) {
    const from = where.get(orderId);
    if (from === undefined || from === to) {
      continue;
    }
    if (to === POOL_KEY) {
      ops.push({ kind: 'remove', orderId, from });
    } else if (from === POOL_KEY) {
      ops.push({ kind: 'assign', orderId, to });
    } else {
      ops.push({ kind: 'move', orderId, from, to });
    }
  }
  return ops;
}

/** « CMD-2041 · Val-d’Isère » — la référence seule quand la feuille ne connaît pas la ville. */
export function cardMetaOf(reference: string, sheet: DeliveryRunSheetStopView | null): string {
  const city = sheet?.address?.ville.trim() ?? '';
  return city === '' ? reference : `${reference} · ${city}`;
}

/** Sans point GPS dans le carnet, l'arrêt n'est pas sur la carte et le calcul ne le place pas. */
function unlocated(sheet: DeliveryRunSheetStopView | null): boolean {
  return sheet !== null && (sheet.addressBook?.gps ?? null) === null;
}

/** Les étiquettes d'une commande à répartir. */
export function orderTagsOf(order: BoardOrder): readonly OrderCardTag[] {
  const tags: OrderCardTag[] = [];
  if (order.broughtBackAt !== null) {
    tags.push({ label: broughtBackLabel(order.broughtBackAt), variant: 'warning' });
  }
  if (order.sheet?.state === 'expected') {
    tags.push({ label: 'Pas encore prête', variant: 'warning' });
  }
  if (order.reason === 'unlocated' || (order.reason === null && unlocated(order.sheet))) {
    tags.push({ label: 'Non située · pas de GPS', variant: 'neutral' });
  }
  if (order.reason === 'overflow') {
    tags.push({ label: 'Ne tient dans aucune tournée (durée max.)', variant: 'warning' });
  }
  if (order.reason === 'capacity') {
    tags.push({ label: 'Ne tient dans aucun véhicule (place)', variant: 'warning' });
  }
  if (order.reason === 'unknown_demand') {
    tags.push({
      label: 'Bacs inconnus · déclarez les bacs ou les contenances',
      variant: 'warning',
    });
  }
  return tags;
}

/** La commande attend un point GPS : le lien vers le carnet se montre. */
export function needsGps(order: BoardOrder): boolean {
  return order.reason === 'unlocated' || (order.reason === null && unlocated(order.sheet));
}

/** Les étiquettes d'un arrêt : signaux, fenêtre intenable, rapportée, pas prête. */
export function stopTagsOf(stop: BoardStop): readonly OrderCardTag[] {
  const tags: OrderCardTag[] = stop.signals.map((label) => ({ label, variant: 'alert' }));
  if (stop.windowClash !== null) {
    tags.push({ label: `Fenêtre intenable après ${stop.windowClash}`, variant: 'warning' });
  }
  if (stop.broughtBackAt !== null) {
    tags.push({ label: broughtBackLabel(stop.broughtBackAt), variant: 'warning' });
  }
  if (stop.sheet?.state === 'expected') {
    tags.push({ label: 'Pas encore prête', variant: 'warning' });
  }
  return tags;
}

/** Le liseré d'un arrêt : le signal l'emporte, puis la fenêtre, puis la proposition. */
export function stopEdgeOf(stop: BoardStop): OrderCardEdge {
  if (stop.signals.length > 0) {
    return 'alert';
  }
  if (stop.windowClash !== null) {
    return 'warning';
  }
  return stop.proposed ? 'proposed' : 'none';
}

/** Le nom d'une commande ou d'un arrêt : le libellé de l'adresse, sinon le client. */
export function cardTitleOf(item: {
  readonly reference: string;
  readonly sheet: DeliveryRunSheetStopView | null;
}): string {
  return stopNameOf(item);
}

/** « Arrêt 2, Chalet Marmotte, avant 08 h 30 » — ce que lit un lecteur d'écran. */
export function stopAriaOf(stop: BoardStop, index: number, frozen: boolean): string {
  const label = `Arrêt ${String(index + 1)}, ${cardTitleOf(stop)}, ${windowShortLabel(stop.window)}`;
  return frozen ? `${label}, tournée partie` : label;
}

/** « Bistrot du Vallon, CMD-2041, 07 h–08 h, à répartir. Glisser vers une tournée. » */
export function orderAriaOf(order: BoardOrder): string {
  return `${cardTitleOf(order)}, ${order.reference}, ${windowShortLabel(order.sheet?.window ?? null)}, à répartir. Glisser vers une tournée.`;
}

/** Une tournée du tableau, au format que lit la carte. */
export function plannedOfBoard(round: BoardRound): PlannedRound {
  return {
    key: round.key,
    roundId: round.roundId,
    vehicleId: round.vehicleId,
    vehicleName: round.vehicleName,
    passage: round.passage,
    lock: round.frozen ? 'departed' : null,
    kept: false,
    keptReason: null,
    touched: false,
    timing: round.timing,
    geometry: round.geometry,
    stops: round.stops.map((stop) => ({
      orderId: stop.orderId,
      reference: stop.reference,
      arrival: null,
      window: stop.window,
      windowMissed: stop.windowMissed,
      sheet: stop.sheet,
    })),
  };
}

/** La liste sous la carte : « P1 · Bistrot du Vallon », « Kangoo · Le Refuge ». */
export function mapRowPrefixOf(round: BoardRound, inVehicle: boolean, several: boolean): string {
  if (!several) {
    return '';
  }
  if (inVehicle) {
    return `P${String(round.passage)} · `;
  }
  const first = round.vehicleName.trim().split(/\s+/u)[0] ?? round.vehicleName;
  return round.passage > 1 ? `${first} ${String(round.passage)} · ` : `${first} · `;
}

const METERS_PER_KM = 1000;

/** « 42 km » — à l'entier ; sous le kilomètre, « < 1 km » plutôt qu'un « 0 km » qui ment. */
export function roundKmLabel(meters: number): string {
  const km = Math.round(meters / METERS_PER_KM);
  return meters < METERS_PER_KM || km < 1 ? '< 1 km' : `${km.toLocaleString('fr-FR')} km`;
}

/** « Départ 5 h 40 · Retour 8 h 15 · 42 km » — l'en-tête d'une tournée proposée. */
export function roundTimingLabel(timing: PlannedTiming): string {
  return `Départ ${timeLabel(timing.departureTime)} · Retour ${timeLabel(timing.returnTime)} · ${roundKmLabel(timing.meters)}`;
}
