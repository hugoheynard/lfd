import type {
  ApplyDeliveryProposalPayload,
  DeliveryKeptRoundReason,
  DeliveryProposalWindow,
  DeliveryProposedRoundView,
  DeliveryRoundProposalView,
  DeliveryRoundTimingView,
  DeliveryRunSheetStopView,
  GpsPoint,
  TimeDeliveryRoundsPayload,
} from '@lfd/contracts';

import type { ComposedDay } from './delivery-rounds';

/**
 * Les dérivations pures de l'écran « Planifier »
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 10 bis).
 *
 * La proposition ne porte que des références (L10b-C3) : le nom, le lieu,
 * l'état et le point de chaque arrêt viennent de la feuille de route du jour,
 * jointe par `orderId`. Glisser un arrêt modifie une composition LOCALE ; le
 * serveur la re-chronomètre, et « Appliquer » l'envoie telle qu'elle est.
 *
 * Type-only sur le contrat, comme `delivery-routing.ts` : une valeur importée
 * de `@lfd/contracts` tirerait zod dans le paquet de la page.
 */

const MINUTES_PER_HOUR = 60;

/** En deçà, attendre l'ouverture ne se signale pas : c'est le temps de se garer. */
export const WAIT_FLAG_MINUTES = 20;

/** Pourquoi une tournée ne se glisse pas (I6) : ni vers elle, ni hors d'elle. */
export type PlannedLock = 'departed' | 'loaded';

const LOCKING: ReadonlySet<DeliveryKeptRoundReason> = new Set(['departed', 'loaded']);

/** Un arrêt de l'écran : la référence proposée, jointe à sa ligne de feuille de route. */
export interface PlannedStop {
  readonly orderId: string;
  readonly reference: string;
  /** `HH:MM`, ou `null` tant que la tournée n'est pas chronométrée. */
  readonly arrival: string | null;
  readonly window: DeliveryProposalWindow | null;
  readonly windowMissed: boolean;
  /** `null` : la feuille de route du jour ne connaît pas la commande. */
  readonly sheet: DeliveryRunSheetStopView | null;
}

/** Les heures d'une tournée, telles que le serveur les a chronométrées. */
export interface PlannedTiming {
  readonly departureTime: string;
  readonly returnTime: string;
  readonly meters: number;
  readonly minutes: number;
  readonly overDuration: boolean;
}

/** Une colonne de l'écran : une tournée proposée, ou gardée telle quelle. */
export interface PlannedRound {
  /** Stable pendant l'édition : l'id de la tournée, ou le véhicule et le passage. */
  readonly key: string;
  readonly roundId: string | null;
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly lock: PlannedLock | null;
  /** Gardée par la proposition : elle n'est envoyée à « Appliquer » que si on y a touché. */
  readonly kept: boolean;
  /** Pourquoi la proposition l'a gardée, `null` pour une tournée proposée. */
  readonly keptReason: DeliveryKeptRoundReason | null;
  readonly touched: boolean;
  /** `null` : à re-chronométrer (déplacée, refusée), ou gardée et jamais chronométrée. */
  readonly timing: PlannedTiming | null;
  readonly geometry: readonly (readonly [number, number])[] | null;
  readonly stops: readonly PlannedStop[];
}

/** Une place dans la composition : la colonne, et le rang dans la colonne. */
export interface PlanSlot {
  readonly key: string;
  readonly index: number;
}

function keyOf(
  round: Pick<DeliveryProposedRoundView, 'roundId' | 'vehicleId' | 'passage'>,
): string {
  return round.roundId ?? `new:${round.vehicleId}:${String(round.passage)}`;
}

function timingOf(round: DeliveryProposedRoundView): PlannedTiming {
  return {
    departureTime: round.departureTime,
    returnTime: round.returnTime,
    meters: round.meters,
    minutes: round.minutes,
    overDuration: round.overDuration,
  };
}

/** La feuille de route du jour, indexée par commande — tout ce que la composition a lu. */
export function sheetsOf(
  composed: ComposedDay | null,
): ReadonlyMap<string, DeliveryRunSheetStopView> {
  const lines = [
    ...(composed?.unassigned ?? []),
    ...(composed?.rounds.flatMap((round) => round.stops) ?? []),
  ];
  return new Map(lines.flatMap(({ sheet }) => (sheet === null ? [] : [[sheet.orderId, sheet]])));
}

function stopsOf(
  round: DeliveryProposedRoundView,
  sheets: ReadonlyMap<string, DeliveryRunSheetStopView>,
): readonly PlannedStop[] {
  return round.stops.map((stop) => ({
    orderId: stop.orderId,
    reference: stop.reference,
    arrival: stop.arrival,
    window: stop.window,
    windowMissed: stop.windowMissed,
    sheet: sheets.get(stop.orderId) ?? null,
  }));
}

/**
 * Les colonnes de l'écran : les tournées proposées, puis celles que la
 * proposition garde telles quelles, lues dans la composition du jour. Une
 * tournée partie ou chargée est verrouillée (I6) ; les autres gardées
 * s'éditent, sans heures tant qu'on n'y a pas touché.
 */
export function planOf(
  proposal: DeliveryRoundProposalView,
  composed: ComposedDay | null,
): readonly PlannedRound[] {
  const sheets = sheetsOf(composed);
  const proposed = proposal.rounds.map((round): PlannedRound => ({
    key: keyOf(round),
    roundId: round.roundId,
    vehicleId: round.vehicleId,
    vehicleName: round.vehicleName,
    passage: round.passage,
    lock: null,
    kept: false,
    keptReason: null,
    touched: false,
    timing: timingOf(round),
    geometry: round.geometry,
    stops: stopsOf(round, sheets),
  }));
  const kept = proposal.kept.map((kept): PlannedRound => {
    const current = composed?.rounds.find(({ round }) => round.id === kept.roundId);
    return {
      key: kept.roundId,
      roundId: kept.roundId,
      vehicleId: current?.round.vehicleId ?? '',
      vehicleName: kept.vehicleName,
      passage: kept.passage,
      lock: LOCKING.has(kept.reason) ? (kept.reason === 'departed' ? 'departed' : 'loaded') : null,
      kept: true,
      keptReason: kept.reason,
      touched: false,
      timing: null,
      geometry: null,
      stops: (current?.stops ?? []).map(({ stop, sheet }) => ({
        orderId: stop.orderId,
        reference: stop.reference,
        arrival: null,
        window: sheet?.window ?? null,
        windowMissed: false,
        sheet,
      })),
    };
  });
  return [...proposed, ...kept];
}

/**
 * La composition après avoir glissé l'arrêt de `from` vers `to` — `null` si
 * le geste ne change rien ou touche une tournée verrouillée (I6). Les deux
 * colonnes touchées perdent leurs heures et leur tracé : ils ne valent plus
 * que pour l'ancienne composition, et l'écran ne ment pas en attendant.
 *
 * `to.index` est le rang voulu APRÈS le retrait de l'arrêt de sa place.
 */
export function moveStop(
  rounds: readonly PlannedRound[],
  from: PlanSlot,
  to: PlanSlot,
): readonly PlannedRound[] | null {
  const source = rounds.find((round) => round.key === from.key);
  const target = rounds.find((round) => round.key === to.key);
  const moving = source?.stops[from.index];
  if (source === undefined || target === undefined || moving === undefined) {
    return null;
  }
  if (source.lock !== null || target.lock !== null || target.vehicleId === '') {
    return null;
  }
  const remaining = source.stops.filter((_, index) => index !== from.index);
  const base = source.key === target.key ? remaining : target.stops;
  const at = Math.max(0, Math.min(to.index, base.length));
  if (source.key === target.key && at === from.index) {
    return null;
  }
  const inserted = [...base.slice(0, at), { ...moving, arrival: null }, ...base.slice(at)];
  return rounds.map((round) => {
    if (round.key === target.key) {
      return stale(round, inserted);
    }
    return round.key === source.key ? stale(round, remaining) : round;
  });
}

function stale(round: PlannedRound, stops: readonly PlannedStop[]): PlannedRound {
  return {
    ...round,
    touched: true,
    timing: null,
    geometry: null,
    stops: stops.map((stop) => ({ ...stop, arrival: null, windowMissed: false })),
  };
}

/**
 * Ce que « chronométrer » reçoit : les colonnes `keys`, dans l'ordre, sans
 * celles qu'un glisser a vidées — le contrat veut au moins une commande par
 * tournée, et une tournée vide n'a pas d'heures.
 */
export function timingPayloadOf(
  day: string,
  rounds: readonly PlannedRound[],
  keys: readonly string[],
): TimeDeliveryRoundsPayload | null {
  const chosen = rounds.filter((round) => keys.includes(round.key) && round.stops.length > 0);
  if (chosen.length === 0) {
    return null;
  }
  return {
    day,
    rounds: chosen.map((round) => ({
      roundId: round.roundId,
      vehicleId: round.vehicleId,
      orderIds: round.stops.map((stop) => stop.orderId),
    })),
  };
}

/**
 * Pose les heures rendues sur les colonnes envoyées. La réponse est dans
 * l'ordre reçu, et n'est retenue que si la colonne porte toujours les mêmes
 * commandes dans le même ordre : un glisser plus récent l'a rendue caduque.
 */
export function withTimings(
  rounds: readonly PlannedRound[],
  sent: TimeDeliveryRoundsPayload,
  view: DeliveryRoundTimingView,
): readonly PlannedRound[] {
  return rounds.map((round) => {
    const rank = sent.rounds.findIndex(
      (line) => line.roundId === round.roundId && line.vehicleId === round.vehicleId,
    );
    const line = sent.rounds[rank];
    const timed = view.rounds[rank];
    if (line === undefined || timed === undefined || !sameOrders(round, line.orderIds)) {
      return round;
    }
    const byOrder = new Map(timed.stops.map((stop) => [stop.orderId, stop]));
    return {
      ...round,
      timing: timingOf(timed),
      geometry: timed.geometry,
      stops: round.stops.map((stop) => {
        const at = byOrder.get(stop.orderId);
        return at === undefined
          ? stop
          : { ...stop, arrival: at.arrival, window: at.window, windowMissed: at.windowMissed };
      }),
    };
  });
}

function sameOrders(round: PlannedRound, orderIds: readonly string[]): boolean {
  return (
    round.stops.length === orderIds.length &&
    round.stops.every((stop, index) => stop.orderId === orderIds[index])
  );
}

/**
 * Ce qu'« Appliquer » renvoie : la composition ÉDITÉE, avec les versions de
 * toutes les tournées lues (L10b-C2, même contrat que le lot 7). Une tournée
 * gardée n'y figure que si on y a touché ; une tournée à ouvrir qu'on a vidée
 * n'est pas ouverte. Une existante vidée part vide : c'est ce qu'on a vu.
 */
export function applyPayloadOfPlan(
  proposal: DeliveryRoundProposalView,
  rounds: readonly PlannedRound[],
): ApplyDeliveryProposalPayload {
  return {
    day: proposal.day,
    rounds: rounds
      .filter((round) => round.lock === null && (!round.kept || round.touched))
      .filter((round) => round.roundId !== null || round.stops.length > 0)
      .map((round) => ({
        roundId: round.roundId,
        vehicleId: round.vehicleId,
        orderIds: round.stops.map((stop) => stop.orderId),
      })),
    versions: proposal.versions.map(({ roundId, version }) => ({ roundId, version })),
  };
}

function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/u.exec(time);
  return match === null ? null : Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]);
}

/** Un problème écrit sur la ligne, et son ton. */
export interface StopFlag {
  readonly label: string;
  readonly variant: 'alert' | 'warning' | 'neutral';
}

/** « 56 min », « 1 h 05 ». */
function waitLabel(minutes: number): string {
  if (minutes < MINUTES_PER_HOUR) {
    return `${String(minutes)} min`;
  }
  const rest = minutes % MINUTES_PER_HOUR;
  return `${String(Math.floor(minutes / MINUTES_PER_HOUR))} h ${String(rest).padStart(2, '0')}`;
}

/**
 * Ce qui demande l'attention, écrit SUR la ligne (L10b-C1) : arriver après
 * son créneau, attendre l'ouverture (au-delà de {@link WAIT_FLAG_MINUTES}),
 * une commande pas encore prête, la signature, la procédure.
 */
export function stopFlags(stop: PlannedStop): readonly StopFlag[] {
  const flags: StopFlag[] = [];
  if (stop.windowMissed) {
    flags.push({ label: 'Arrive après son créneau', variant: 'alert' });
  }
  const arrival = stop.arrival === null ? null : minutesOf(stop.arrival);
  const start = stop.window?.start ?? null;
  const opening = start === null ? null : minutesOf(start);
  if (arrival !== null && opening !== null && opening - arrival >= WAIT_FLAG_MINUTES) {
    flags.push({ label: `Attend ${waitLabel(opening - arrival)} l’ouverture`, variant: 'warning' });
  }
  if (stop.sheet?.state === 'expected') {
    flags.push({ label: 'Pas encore prête', variant: 'warning' });
  }
  if (stop.sheet?.signatureRequired === true) {
    flags.push({ label: 'Signature exigée', variant: 'neutral' });
  }
  const steps = stop.sheet?.addressBook?.procedure.length ?? 0;
  if (steps > 0) {
    flags.push({
      label: steps === 1 ? 'Procédure en 1 étape' : `Procédure en ${String(steps)} étapes`,
      variant: 'neutral',
    });
  }
  return flags;
}

/**
 * Le nom d'un arrêt : le LIBELLÉ DE L'ADRESSE livrée (« Le Chalet »), parce
 * qu'un client peut être livré à plusieurs endroits et que c'est l'endroit
 * qu'on cherche ; sinon la raison sociale ; sinon la référence seule.
 */
export function stopNameOf(stop: PlannedStop): string {
  if (stop.sheet === null) {
    return stop.reference;
  }
  const label = stop.sheet.address?.label.trim() ?? '';
  return label === '' ? stop.sheet.customerLabel : label;
}

/** La société, en second, quand elle diffère du nom affiché ; `null` sinon. */
export function stopCompanyOf(stop: PlannedStop): string | null {
  if (stop.sheet === null) {
    return null;
  }
  const company = stop.sheet.tradeName ?? stop.sheet.customerLabel;
  return company === stopNameOf(stop) ? null : company;
}

/** « 3 rue des Lilas, Paris », ou `null` sans adresse. */
export function stopPlaceOf(stop: PlannedStop): string | null {
  const address = stop.sheet?.address;
  if (address === null || address === undefined) {
    return null;
  }
  return [address.ligne1, address.ville].filter((part) => part.trim() !== '').join(', ');
}

/** Le point de l'arrêt, lu dans le carnet d'adresses ; `null` : pas de repère. */
export function stopPointOf(stop: PlannedStop): GpsPoint | null {
  return stop.sheet?.addressBook?.gps ?? null;
}

/** Ce que l'en-tête compte : ce qui demande l'attention, avant le détail. */
export interface PlanSummary {
  readonly deliveries: number;
  readonly vans: number;
  readonly late: number;
  readonly notReady: number;
}

export function planSummary(rounds: readonly PlannedRound[]): PlanSummary {
  const stops = rounds.flatMap((round) => round.stops);
  return {
    deliveries: stops.length,
    vans: new Set(
      rounds.filter((round) => round.stops.length > 0).map((round) => round.vehicleName),
    ).size,
    late: stops.filter((stop) => stop.windowMissed).length,
    notReady: stops.filter((stop) => stop.sheet?.state === 'expected').length,
  };
}

/**
 * Une couleur par véhicule, prise dans les tokens fold (jamais une couleur en
 * dur) : l'alerte est réservée au « hors créneau », elle n'est pas du lot.
 */
export const ROUND_COLORS: readonly string[] = [
  '--fold-color-primary',
  '--fold-color-info',
  '--fold-color-success',
  '--fold-color-warning',
  '--fold-color-text-secondary',
];

/** La couleur d'une colonne : le rang de son véhicule dans l'ordre d'apparition. */
export function colorOf(rounds: readonly PlannedRound[], key: string): string {
  const vehicles = [...new Set(rounds.map((round) => round.vehicleName))];
  const round = rounds.find((candidate) => candidate.key === key);
  const rank = round === undefined ? 0 : vehicles.indexOf(round.vehicleName);
  return ROUND_COLORS[rank % ROUND_COLORS.length] ?? '--fold-color-primary';
}
