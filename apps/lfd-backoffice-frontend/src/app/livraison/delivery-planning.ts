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
 * La composition après un geste : chaque colonne nommée dans `lists` prend ces
 * commandes, dans cet ordre ; les autres ne bougent pas. `null` si une colonne
 * nommée est verrouillée (I6), n'est pas un véhicule connu, ou si une commande
 * n'a pas d'arrêt connu dans `stops`.
 *
 * Les colonnes touchées perdent leurs heures et leur tracé : ils ne valent
 * plus que pour l'ancienne composition, et l'écran ne ment pas en attendant.
 */
export function planWithLists(
  rounds: readonly PlannedRound[],
  lists: Readonly<Record<string, readonly string[]>>,
  stops: ReadonlyMap<string, PlannedStop>,
): readonly PlannedRound[] | null {
  const touched = rounds.filter((round) => lists[round.key] !== undefined);
  if (touched.some((round) => round.lock !== null || round.vehicleId === '')) {
    return null;
  }
  const next = new Map<string, readonly PlannedStop[]>();
  for (const round of touched) {
    const placed: PlannedStop[] = [];
    for (const orderId of lists[round.key] ?? []) {
      const stop = stops.get(orderId);
      if (stop === undefined) {
        return null;
      }
      placed.push(stop);
    }
    next.set(round.key, placed);
  }
  return rounds.map((round) => {
    const placed = next.get(round.key);
    return placed === undefined ? round : stale(round, placed);
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

/**
 * Le nom d'un arrêt : le LIBELLÉ DE L'ADRESSE livrée (« Le Chalet »), parce
 * qu'un client peut être livré à plusieurs endroits et que c'est l'endroit
 * qu'on cherche ; sinon la raison sociale ; sinon la référence seule.
 */
export function stopNameOf(stop: Pick<PlannedStop, 'reference' | 'sheet'>): string {
  if (stop.sheet === null) {
    return stop.reference;
  }
  const label = stop.sheet.address?.label.trim() ?? '';
  return label === '' ? stop.sheet.customerLabel : label;
}

/** Le point de l'arrêt, lu dans le carnet d'adresses ; `null` : pas de repère. */
export function stopPointOf(stop: Pick<PlannedStop, 'sheet'>): GpsPoint | null {
  return stop.sheet?.addressBook?.gps ?? null;
}

/** Ce que l'en-tête compte : ce qui demande l'attention, avant le détail. */
export interface PlanSummary {
  readonly deliveries: number;
  readonly vans: number;
  readonly late: number;
  readonly notReady: number;
  /** La distance totale des tournées chronométrées, en mètres. */
  readonly meters: number;
  /** Les tournées non vides — un véhicule peut en faire plusieurs. */
  readonly rounds: number;
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
    meters: rounds.reduce((sum, round) => sum + (round.timing?.meters ?? 0), 0),
    rounds: rounds.filter((round) => round.stops.length > 0).length,
  };
}

/**
 * La roue des teintes partagée ÉGALEMENT entre les véhicules du jour (Hugo,
 * 2026-09-29 : « des circuits très contrastés »). Deux tokens fold voisins
 * (primaire et info) sortaient en deux bleus que la carte ne séparait pas.
 *
 * En OKLCH, luminosité et saturation fixes : seules les teintes changent, donc
 * aucune tournée ne paraît plus importante qu'une autre, et l'écart perçu
 * entre deux teintes est le même partout sur la roue — ce que HSL ne tient pas.
 * Une luminosité moyenne se lit sur le fond clair comme sur le sombre.
 */
const ROUND_LIGHTNESS = 0.63;
const ROUND_CHROMA = 0.17;
/** Départ de la roue : un orangé, loin du rouge réservé au « hors créneau ». */
const ROUND_FIRST_HUE = 45;
const FULL_TURN = 360;

/** La couleur d'un rang parmi `count` véhicules : une couleur CSS complète. */
export function roundColor(rank: number, count: number): string {
  const hue = (ROUND_FIRST_HUE + (rank * FULL_TURN) / Math.max(count, 1)) % FULL_TURN;
  return `oklch(${String(ROUND_LIGHTNESS)} ${String(ROUND_CHROMA)} ${hue.toFixed(1)})`;
}

/**
 * La couleur de chaque véhicule : son rang dans `vehicleIds` (sans doublon),
 * sur la roue de {@link roundColor}. Le même véhicule garde sa couleur tant
 * que la liste ne change pas — d'un onglet à l'autre, de la composition à
 * l'aperçu.
 */
export function vehicleColors(vehicleIds: readonly string[]): ReadonlyMap<string, string> {
  const unique = [...new Set(vehicleIds)];
  return new Map(unique.map((id, rank) => [id, roundColor(rank, unique.length)]));
}
