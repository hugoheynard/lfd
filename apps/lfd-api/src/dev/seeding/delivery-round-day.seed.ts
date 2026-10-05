import { type DayBins, DEFAULT_BINS, resolveBins } from "./delivery-bins.seed.js";
import type { DeliveryDayReport, PlacedDelivery } from "./delivery-day.seed.js";
import {
  assignSeedDriver,
  prismaDriverReader,
  type SeedDriverAssignment,
} from "./delivery-driver.seed.js";
import { FLEET, seedFleet } from "./delivery-fleet.seed.js";
import {
  binContainers,
  chooseLaboDeparture,
  composeRound,
  halfBinOf,
  loadRound,
  type RoundStop,
  spreadOverVehicles,
} from "./delivery-rounds.seed.js";
import {
  asStaff,
  atHour,
  isoDay,
  packFully,
  type PlacedOrder,
  type SeedContext,
} from "./order-placing.seed.js";

/**
 * **La livraison d'aujourd'hui, avancée par étapes** (2026-10-05) — sortie
 * d'`advanceDeliveryDay`, qui faisait tout d'un bloc, quand la journée a été
 * découpée (`documentation/order/plan-jeu-de-donnees-par-etapes.md`).
 *
 * Dans l'ordre que le code impose, et pas dans un autre :
 *
 * 1. **composer** les tournées ({@link composeTodayRounds}) — AVANT le
 *    colisage depuis K3c (`colisage.md` §17.3) : un bac de livraison naît au
 *    colisage, et partager une moitié exige deux arrêts CONSÉCUTIFS d'une même
 *    tournée. La composition, elle, n'exige rien du fournil : l'affectation
 *    d'un arrêt ne refuse qu'une commande annulée, hors livraison ou d'un autre
 *    jour (`unassignableReason`, relu le 2026-10-05) ;
 * 2. **coliser** les livraisons prêtes ({@link packDeliveryDay}) ;
 * 3. **charger** tous les bacs ({@link loadTodayRounds}), sans départ.
 *
 * Une commande non prête n'entre dans aucune tournée hors Val d'Isère : sans
 * bac, elle ne se charge pas.
 */

/** Le rang, dans la tournée, de la livraison du comptoir (La Folie Douce, La Daille). */
const COUNTER_DELIVERY_STOP = 4;

/** Le point de départ des tournées — celui que la station sème. */
const LABO = "Le Labo";

/** Le véhicule de la tournée de Val d'Isère, composée dans l'ordre de la vallée. */
const ROUND_VEHICLE = "Camionnette 1";

/** Colisage à 5 h comme le comptoir ; tournées et chargement à 5 h 45, avant le départ. */
const PACKED_HOUR = 5;
const LOADING_HOUR = 5;
const LOADING_MINUTE = 45;

/** Une tournée composée, avec ses arrêts dans l'ordre. */
export interface ComposedRound {
  readonly roundId: string;
  readonly stops: readonly RoundStop[];
}

/** Ce que la composition a posé. */
export interface ComposedDay {
  readonly rounds: readonly ComposedRound[];
  readonly driver: SeedDriverAssignment;
}

/**
 * **Étape « tournées composées »** : la flotte et le départ semés, une tournée
 * par véhicule actif qui a des arrêts — Camionnette 1 tient Val d'Isère dans
 * l'ordre de la vallée, les autres livraisons prêtes en tranches contiguës —,
 * sans aucun bac. La première tournée est affectée au requérant.
 *
 * @param counterDelivery la livraison du comptoir (La Daille), rang 4 de Val d'Isère.
 */
export async function composeTodayRounds(
  context: SeedContext,
  day: {
    readonly today: Date;
    readonly placed: readonly PlacedDelivery[];
    readonly counterDelivery: PlacedOrder | null;
  },
): Promise<ComposedDay> {
  const forDay = isoDay(day.today);
  const vehicleIds = fleetIds(await seedFleet(context));
  await chooseLaboDeparture(context, LABO);
  const at = atHour(day.today, LOADING_HOUR, LOADING_MINUTE);
  const spread = spreadOverVehicles(
    roundStops(day.placed, day.counterDelivery === null ? [] : [day.counterDelivery]),
    otherReadyStops(day.placed),
    vehicleIds.length,
  );
  const rounds: ComposedRound[] = [];
  for (const [rank, stops] of spread.entries()) {
    const vehicleId = vehicleIds[rank];
    if (stops.length === 0 || vehicleId === undefined) continue;
    const roundId = await composeRound(context, { day: forDay, vehicleId, at }, stops);
    rounds.push({ roundId, stops });
  }
  const driver = await assignSeedDriver(
    {
      commands: context.commands,
      reader: prismaDriverReader(context.prisma),
      requester: context.requester,
    },
    { roundId: rounds[0]?.roundId ?? "", at },
  );
  return { rounds, driver };
}

/**
 * **Les livraisons prêtes, colisées en bacs**, dans l'ordre de la tournée — une
 * moitié se partage avec l'arrêt PRÉCÉDENT, qui doit donc avoir ouvert la
 * sienne. Les tournées doivent exister. Rend le nombre de moitiés partagées.
 */
export async function packDeliveryDay(
  context: SeedContext,
  day: {
    readonly today: Date;
    readonly placed: readonly PlacedDelivery[];
    readonly baked: Set<string>;
    readonly binTypes: ReadonlyMap<string, string>;
  },
): Promise<number> {
  const forDay = isoDay(day.today);
  const byStop = new Map(
    day.placed.flatMap((placed) =>
      placed.entry.stop === null ? [] : [[placed.entry.stop, placed.order.id] as const],
    ),
  );
  const ordered = [...day.placed].sort(
    (left, right) =>
      (left.entry.stop ?? Number.MAX_SAFE_INTEGER) - (right.entry.stop ?? Number.MAX_SAFE_INTEGER),
  );
  let shared = 0;
  for (const { order, entry } of ordered.filter((placed) => placed.entry.ready)) {
    const previous = entry.stop === null ? undefined : byStop.get(entry.stop - 1);
    const share =
      entry.sharesPreviousHalf === undefined || previous === undefined
        ? null
        : { partnerBinId: await halfBinOf(context, previous), ...entry.sharesPreviousHalf };
    shared += share === null ? 0 : 1;
    const bins: readonly DayBins[] = entry.bins ?? DEFAULT_BINS;
    const containers = binContainers(resolveBins(day.binTypes, bins), share);
    await asStaff(atHour(day.today, PACKED_HOUR), () =>
      packFully(context, forDay, order.reference, day.baked, containers),
    );
  }
  return shared;
}

/**
 * Les tournées du jour telles qu'elles sont en base, arrêts vivants dans
 * l'ordre — ce que l'étape du chargement lit, dans une autre requête que la
 * composition.
 */
export async function readTodayRounds(
  context: SeedContext,
  forDay: string,
): Promise<readonly ComposedRound[]> {
  const rounds = await context.prisma.deliveryRound.findMany({
    where: { serviceDay: forDay },
    select: {
      id: true,
      stops: {
        where: { removedAt: null },
        select: { orderId: true },
        orderBy: { position: "asc" },
      },
    },
    orderBy: { id: "asc" },
  });
  return rounds.map((round) => ({ roundId: round.id, stops: round.stops }));
}

/**
 * **Étape « tournées chargées »** : chaque bac de chaque arrêt chargé, comme
 * au scan — sans départ. Rend le nombre de bacs chargés.
 */
export async function loadTodayRounds(
  context: SeedContext,
  day: { readonly today: Date; readonly rounds: readonly ComposedRound[] },
): Promise<number> {
  const at = atHour(day.today, LOADING_HOUR, LOADING_MINUTE);
  let loaded = 0;
  for (const round of day.rounds) {
    loaded += (await loadRound(context, { roundId: round.roundId, at }, round.stops)).loadedBins;
  }
  return loaded;
}

/** La journée de livraison, comptée — ce que le rechargement raconte. */
export function deliveryDayReport(day: {
  readonly forDay: string;
  readonly placed: readonly PlacedDelivery[];
  /** Les livraisons posées par la file du comptoir (La Daille). */
  readonly counterDeliveries: number;
  readonly composed: ComposedDay;
  readonly sharedBins: number;
  readonly loadedBins: number;
}): DeliveryDayReport {
  const deliveriesToday = day.placed.length + day.counterDeliveries;
  const stops = day.composed.rounds.reduce((total, round) => total + round.stops.length, 0);
  return {
    day: day.forDay,
    deliveries: day.placed.length,
    deliveriesToday,
    notReady: day.placed.filter((placed) => !placed.entry.ready).length,
    vehicles: FLEET.length,
    rounds: day.composed.rounds.length,
    stops,
    loadedBins: day.loadedBins,
    sharedBins: day.sharedBins,
    driver: day.composed.driver,
    unassigned: deliveriesToday - stops,
  };
}

/**
 * Les véhicules de la flotte semée, Camionnette 1 en tête — c'est elle qui
 * reçoit la tournée de Val d'Isère. Tous actifs : `seedFleet` remet en
 * service une camionnette retirée.
 */
function fleetIds(vehicles: ReadonlyMap<string, string>): readonly string[] {
  const first = vehicles.get(ROUND_VEHICLE);
  if (first === undefined) {
    throw new Error(`Véhicule « ${ROUND_VEHICLE} » absent de la flotte semée.`);
  }
  return [first, ...[...vehicles].flatMap(([name, id]) => (name === ROUND_VEHICLE ? [] : [id]))];
}

/** Les livraisons prêtes hors Val d'Isère, dans l'ordre des vallées. */
function otherReadyStops(placed: readonly PlacedDelivery[]): readonly RoundStop[] {
  return placed.flatMap(({ order, entry }) =>
    entry.stop === null && entry.ready ? [{ orderId: order.id }] : [],
  );
}

/** Les arrêts de la tournée, dans l'ordre de la vallée — prêts ou non. */
function roundStops(
  placed: readonly PlacedDelivery[],
  counter: readonly PlacedOrder[],
): readonly RoundStop[] {
  const ranked = placed.flatMap(({ order, entry }) =>
    entry.stop === null ? [] : [{ rank: entry.stop, orderId: order.id }],
  );
  const fromCounter = counter.map((order) => ({ rank: COUNTER_DELIVERY_STOP, orderId: order.id }));
  return [...ranked, ...fromCounter]
    .sort((left, right) => left.rank - right.rank)
    .map(({ rank: _rank, ...stop }) => stop);
}
