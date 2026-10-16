import type { DayComposer } from "../../delivery/application/day-composer.js";
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
  type ComposedRound,
  driverRoundOf,
  halfBinOf,
  halfSharedBy,
  loadRound,
  packingOrderOf,
} from "./delivery-rounds.seed.js";
import {
  asStaff,
  atHour,
  isoDay,
  packFully,
  type PlacedOrder,
  type SeedContext,
} from "./order-placing.seed.js";
import { loadTransferBins } from "./transfer-bins.seed.js";

export type { ComposedRound } from "./delivery-rounds.seed.js";

/**
 * **La livraison d'aujourd'hui, avancée par étapes** (2026-10-05) — sortie
 * d'`advanceDeliveryDay`, qui faisait tout d'un bloc, quand la journée a été
 * découpée (`documentation/commandes/architecture-jeu-de-donnees-par-etapes.md`).
 *
 * Dans l'ordre que le code impose, et pas dans un autre :
 *
 * 1. **composer** les tournées ({@link composeTodayRounds}) — par le VRAI
 *    calcul (`DayComposer`, « Proposer » puis « Appliquer », puis les
 *    transferts internes), AVANT le colisage depuis K3c (`colisage.md`
 *    §17.3) : un bac de livraison naît au colisage, et partager une moitié
 *    exige deux arrêts CONSÉCUTIFS d'une même tournée ;
 * 2. **coliser** les livraisons prêtes ({@link packDeliveryDay}) ;
 * 3. **charger** tous les bacs ({@link loadTodayRounds}), sans départ.
 *
 * 🔴 **Plus aucune tournée n'est écrite à la main** (Hugo, 2026-10-14 : « la
 * démo doit montrer ce que la composition automatique décide vraiment »).
 * Jusque-là, Camionnette 1 tenait Val d'Isère dans un ordre de rangs fixes et
 * les autres livraisons étaient découpées en tranches, sans géographie ni
 * horaire ; seul l'après-midi venait du calcul.
 */

/** Le point de départ des tournées — celui que la station sème. */
const LABO = "Le Labo";

/** Colisage à 5 h comme le comptoir ; tournées et chargement à 5 h 45, avant le départ. */
const PACKED_HOUR = 5;
export const LOADING_HOUR = 5;
export const LOADING_MINUTE = 45;

/** Midi : le chargement d'un second passage, après le retour du matin. */
const LATER_PASSAGE_LOADING_HOUR = 12;

/** Les sacs que l'arrêt qui partage une moitié y met. */
const SHARED_HALF_INNER_BAGS = 1;

/** Ce que la composition a posé. */
export interface ComposedDay {
  readonly rounds: readonly ComposedRound[];
  readonly driver: SeedDriverAssignment;
}

/**
 * **Étape « tournées composées »** : la flotte et le départ semés, puis la
 * composition automatique — exactement ce que fait l'arrêt du plan —, sans
 * aucun bac. Ce que le calcul laisse à répartir y reste, visiblement.
 *
 * Le requérant reçoit la première tournée dont toutes les livraisons seront
 * prêtes (`driverRoundOf`) : c'est elle qu'il fera partir depuis « Ma
 * tournée », et une livraison jamais colisée l'en empêcherait.
 *
 * @param notReady les livraisons que le scénario laisse hors colisage.
 */
export async function composeTodayRounds(
  context: SeedContext,
  day: {
    readonly today: Date;
    readonly composer: DayComposer;
    readonly notReady: ReadonlySet<string>;
  },
): Promise<ComposedDay> {
  const forDay = isoDay(day.today);
  await seedFleet(context);
  await chooseLaboDeparture(context, LABO);
  const at = atHour(day.today, LOADING_HOUR, LOADING_MINUTE);
  await asStaff(at, () => day.composer.composeDay(forDay));
  const rounds = await readTodayRounds(context, forDay);
  const driver = await assignSeedDriver(
    {
      commands: context.commands,
      reader: prismaDriverReader(context.prisma),
      requester: context.requester,
    },
    { roundId: driverRoundOf(rounds, day.notReady)?.roundId ?? "", at },
  );
  return { rounds, driver };
}

/**
 * **Les livraisons prêtes, colisées en bacs**, dans l'ordre des tournées —
 * une moitié ouverte se partage avec l'arrêt qui la SUIT dans sa tournée,
 * s'il est prêt (`halfSharedBy`). Le partage dépend donc de ce que le calcul
 * a composé : il n'a lieu que si l'arrêt suivant existe et est colisé ici.
 * Les tournées doivent exister. Rend le nombre de moitiés partagées.
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
  const rounds = await readTodayRounds(context, forDay);
  const ready = day.placed.filter((placed) => placed.entry.ready);
  const opensHalf = new Set(
    ready.flatMap(({ order, entry }) =>
      (entry.bins ?? DEFAULT_BINS).some((bins) => bins.half) ? [order.id] : [],
    ),
  );
  const sharing = halfSharedBy(rounds, opensHalf, new Set(ready.map((placed) => placed.order.id)));
  let shared = 0;
  for (const { order, entry } of packingOrderOf(ready, rounds)) {
    const partner = sharing.get(order.id);
    const share =
      partner === undefined
        ? null
        : {
            partnerBinId: await halfBinOf(context, partner),
            innerBags: SHARED_HALF_INNER_BAGS,
          };
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
 * l'ordre — ce que le colisage et le chargement lisent, dans une autre
 * requête que la composition. Véhicule par véhicule, puis par passage.
 */
export async function readTodayRounds(
  context: SeedContext,
  forDay: string,
): Promise<readonly ComposedRound[]> {
  const rounds = await context.prisma.deliveryRound.findMany({
    where: { serviceDay: forDay },
    select: {
      id: true,
      passage: true,
      stops: {
        where: { removedAt: null },
        select: { orderId: true },
        orderBy: { position: "asc" },
      },
    },
    orderBy: [{ vehicleName: "asc" }, { passage: "asc" }],
  });
  return rounds.map((round) => ({
    roundId: round.id,
    passage: round.passage,
    // `null` : l'arrêt d'un transfert interne — il sépare deux livraisons.
    sequence: round.stops.map((stop) => stop.orderId),
    stops: round.stops.flatMap((stop) =>
      stop.orderId === null ? [] : [{ orderId: stop.orderId }],
    ),
  }));
}

/**
 * **Étape « tournées chargées »** : chaque bac de chaque arrêt chargé, comme
 * au scan — le matin à 5 h 45, un second passage à midi —, puis les bacs des
 * transferts internes placés. Sans départ. Rend le nombre de bacs chargés.
 */
export async function loadTodayRounds(
  context: SeedContext,
  day: { readonly today: Date; readonly rounds: readonly ComposedRound[] },
): Promise<number> {
  const morning = atHour(day.today, LOADING_HOUR, LOADING_MINUTE);
  let loaded = 0;
  for (const round of day.rounds) {
    const at = round.passage > 1 ? atHour(day.today, LATER_PASSAGE_LOADING_HOUR) : morning;
    loaded += (await loadRound(context, { roundId: round.roundId, at }, round.stops)).loadedBins;
  }
  return loaded + (await loadTransferBins(context, { forDay: isoDay(day.today), at: morning }));
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

/** Les livraisons du jour que le scénario ne colise pas : sans bac, elles ne partent pas. */
export function notReadyDeliveries(
  placed: readonly PlacedDelivery[],
  counterDelivery: { readonly order: PlacedOrder; readonly ready: boolean } | null,
): ReadonlySet<string> {
  const counter =
    counterDelivery === null || counterDelivery.ready ? [] : [counterDelivery.order.id];
  return new Set([
    ...placed.flatMap(({ order, entry }) => (entry.ready ? [] : [order.id])),
    ...counter,
  ]);
}
