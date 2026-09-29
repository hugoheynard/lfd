import { CLIENT_ENSEIGNE } from "./client.seed.js";
import {
  chooseLaboDeparture,
  composeLoadedRound,
  FLEET,
  seedFleet,
} from "./delivery-rounds.seed.js";
import {
  asStaff,
  atHour,
  isoDay,
  packFully,
  place,
  type PlacedOrder,
  type SeedContext,
  type SeedLine,
  type SeedWindow,
  type Target,
} from "./order-placing.seed.js";

/**
 * **La journée de livraison d'AUJOURD'HUI** (Hugo, 2026-09-29) — de quoi se
 * projeter dans la feuille de route, l'écran des tournées et « Proposer », et
 * le chargement.
 *
 * Seize livraisons de plus que la file du comptoir, dans trois vallées : Val
 * d'Isère, Bourg-Saint-Maurice et les Arcs, La Rosière. Posées HIER par le
 * vrai handler (l'heure limite s'y oppose comme au client), AVANT le plan du
 * soir — sans quoi elles ne seraient ni en fournée ni au colisage.
 *
 * Ce que la journée montre, et pourquoi :
 *
 * - **la plupart colisées**, par les gestes du fournil (`packFully`) : une
 *   livraison qui n'est pas prête ne se charge pas ;
 * - **trois pas encore prêtes** : la feuille de route doit dire ce qui manque ;
 * - **trois fenêtres demandées** qui s'écartent du carnet, les autres celle du
 *   carnet — la provenance se lit sur la commande ;
 * - **une sans créneau** (l'Épicerie des Eulets, dont le carnet n'en porte
 *   pas) ;
 * - **une tournée composée et chargée** pour Camionnette 1 — Val d'Isère —, pas
 *   partie ; **tout le reste non réparti**, pour qu'on presse « Proposer ».
 */

/** Une livraison du jour, visée par l'enseigne du client. */
interface DeliveryDayEntry {
  readonly enseigne: string;
  /** L'adresse du carnet par libellé, quand ce n'est pas celle par défaut. */
  readonly deliveryLabel?: string;
  /** La fenêtre demandée, quand elle s'écarte du carnet ; `null` = celle du carnet. */
  readonly window: SeedWindow | null;
  readonly ready: boolean;
  /**
   * Le rang de l'arrêt dans la tournée de Val d'Isère, ou `null` : non
   * répartie. L'ordre suit la vallée depuis Le Labo — monter au Laisinant et
   * au Fornet, redescendre par le centre, finir à La Daille, sur la route de
   * sortie.
   */
  readonly stop: number | null;
  /** Combien de sacs, quand elle est dans la tournée. */
  readonly bags?: number;
  readonly lines: readonly SeedLine[];
}

const DELIVERY_DAY: readonly DeliveryDayEntry[] = [
  // ── Val d'Isère — la tournée de Camionnette 1 ─────────────────────────────
  {
    enseigne: "Chalet du Laisinant",
    window: null,
    ready: true,
    stop: 0,
    lines: [
      { sku: "PAI-001", quantity: 6 },
      { sku: "VIE-001", quantity: 12 },
    ],
  },
  {
    enseigne: "Le Refuge du Fond",
    window: null,
    ready: true,
    stop: 1,
    lines: [
      { sku: "PAI-013", quantity: 8 },
      { sku: "PAI-001", quantity: 15 },
    ],
  },
  {
    enseigne: "Le Petit Chaudron",
    // Plus tôt que son carnet : le service du petit-déjeuner est avancé.
    window: { start: "06:30", end: "07:30" },
    ready: true,
    stop: 2,
    lines: [
      { sku: "VIE-001", quantity: 24 },
      { sku: "VIE-002", quantity: 24 },
      { sku: "VIE-005", quantity: 10 },
    ],
  },
  {
    enseigne: "La Fromagerie du Parc",
    window: null,
    ready: true,
    stop: 3,
    bags: 2,
    lines: [
      { sku: "PAI-001", quantity: 30 },
      { sku: "PAI-013", quantity: 12 },
    ],
  },
  // (La Folie Douce, La Daille, est la livraison du comptoir : rang 4.)
  {
    enseigne: "Les Balcons de la Daille",
    window: null,
    ready: true,
    stop: 5,
    lines: [
      { sku: "VIE-009", quantity: 20 },
      { sku: "VIE-001", quantity: 18 },
    ],
  },
  // ── Bourg-Saint-Maurice, les Arcs, Séez — non répartis ────────────────────
  {
    enseigne: "Hôtel des Pins",
    window: null,
    ready: true,
    stop: null,
    lines: [
      { sku: "VIE-001", quantity: 60 },
      { sku: "VIE-002", quantity: 40 },
      { sku: "VIE-009", quantity: 24 },
    ],
  },
  {
    enseigne: "Hôtel Le Lac Blanc",
    window: { start: "08:00", end: "09:00" },
    ready: true,
    stop: null,
    lines: [
      { sku: "VIE-002", quantity: 36 },
      { sku: "VIE-005", quantity: 12 },
    ],
  },
  {
    enseigne: "Le Refuge 1950",
    window: null,
    ready: true,
    stop: null,
    lines: [
      { sku: "PAI-001", quantity: 20 },
      { sku: "VIE-019", quantity: 10 },
    ],
  },
  {
    enseigne: "Brasserie des Marmottes",
    // Plus tard que le carnet, et pas encore prête : la feuille de route doit
    // montrer un sac qui manque sans alarmer pour rien.
    window: { start: "10:30", end: "11:30" },
    ready: false,
    stop: null,
    lines: [
      { sku: "PAI-001", quantity: 25 },
      { sku: "PAI-013", quantity: 6 },
    ],
  },
  {
    enseigne: "Auberge des Contamines",
    window: null,
    ready: true,
    stop: null,
    lines: [
      { sku: "PAI-013", quantity: 10 },
      { sku: "VIE-001", quantity: 15 },
    ],
  },
  {
    enseigne: "Épicerie des Eulets",
    window: null,
    ready: true,
    stop: null,
    lines: [
      { sku: "PAI-001", quantity: 12 },
      { sku: "VIE-016", quantity: 8 },
    ],
  },
  {
    enseigne: "Le Comptoir de la Chaudanne",
    window: null,
    ready: true,
    stop: null,
    lines: [
      { sku: "VIE-001", quantity: 30 },
      { sku: "VIE-002", quantity: 20 },
    ],
  },
  {
    enseigne: "Café des Grangettes",
    window: null,
    ready: false,
    stop: null,
    lines: [
      { sku: "VIE-009", quantity: 18 },
      { sku: "VIE-005", quantity: 8 },
    ],
  },
  // ── La Rosière, Montvalezan — non répartis ────────────────────────────────
  {
    enseigne: "Gîte du Villaret",
    window: null,
    ready: false,
    stop: null,
    lines: [
      { sku: "PAI-001", quantity: 8 },
      { sku: "VIE-001", quantity: 16 },
    ],
  },
  {
    enseigne: "Crêperie du Gollet",
    window: null,
    ready: true,
    stop: null,
    lines: [
      { sku: "VIE-019", quantity: 12 },
      { sku: "PAI-013", quantity: 4 },
    ],
  },
  {
    // La seconde adresse du client de référence : son chalet de La Rosière.
    enseigne: CLIENT_ENSEIGNE,
    deliveryLabel: "Le Chalet",
    window: null,
    ready: true,
    stop: null,
    lines: [
      { sku: "VIE-001", quantity: 10 },
      { sku: "PAI-001", quantity: 6 },
    ],
  },
];

/** Le rang, dans la tournée, de la livraison du comptoir (La Folie Douce, La Daille). */
const COUNTER_DELIVERY_STOP = 4;

/** Le point de départ des tournées — celui que la station sème. */
const LABO = "Le Labo";

/** Le véhicule de la tournée composée. */
const ROUND_VEHICLE = "Camionnette 1";

/** Colisage à 5 h comme le comptoir ; chargement à 5 h 45, avant le départ. */
const PACKED_HOUR = 5;
const LOADING_HOUR = 5;
const LOADING_MINUTE = 45;

/** Une livraison posée, avec ce que la journée doit en faire. */
export interface PlacedDelivery {
  readonly order: PlacedOrder;
  readonly entry: DeliveryDayEntry;
}

/** Ce que la journée de livraison a posé. */
export interface DeliveryDayReport {
  readonly day: string;
  /** Les livraisons posées par ce module — celle du comptoir n'y est pas. */
  readonly deliveries: number;
  /** Les livraisons du jour, comptoir compris : ce que la feuille de route montre. */
  readonly deliveriesToday: number;
  readonly notReady: number;
  readonly vehicles: number;
  readonly rounds: number;
  readonly stopsInRound: number;
  readonly loadedBags: number;
  /** Ce qui reste à répartir — ce que « Proposer » a à placer. */
  readonly unassigned: number;
}

/** Pose les livraisons du jour, la veille, par le vrai handler. */
export async function placeDeliveryDay(
  context: SeedContext,
  byEnseigne: ReadonlyMap<string, Target>,
  orderedAt: Date,
  forDay: string,
): Promise<readonly PlacedDelivery[]> {
  const placed: PlacedDelivery[] = [];
  for (const entry of DELIVERY_DAY) {
    const client = byEnseigne.get(entry.enseigne);
    if (client === undefined) {
      throw new Error(
        `Client « ${entry.enseigne} » absent : semer les clients avant la livraison.`,
      );
    }
    const order = await place(context, client, {
      at: orderedAt,
      forDay,
      method: "delivery",
      point: null,
      window: entry.window,
      lines: entry.lines,
      paid: false,
      ...(entry.deliveryLabel === undefined ? {} : { deliveryLabel: entry.deliveryLabel }),
    });
    placed.push({ order, entry });
  }
  return placed;
}

/**
 * Colise ce qui doit être prêt, sème la flotte et le départ, compose la
 * tournée de Val d'Isère. À appeler APRÈS le plan du soir.
 */
export async function advanceDeliveryDay(
  context: SeedContext,
  day: {
    readonly today: Date;
    readonly placed: readonly PlacedDelivery[];
    /** Les livraisons du jour déjà colisées ailleurs (le comptoir) — rang 4 de la tournée. */
    readonly alreadyPacked: readonly PlacedOrder[];
    readonly baked: Set<string>;
  },
): Promise<DeliveryDayReport> {
  const forDay = isoDay(day.today);
  for (const { order, entry } of day.placed) {
    if (entry.ready) {
      await asStaff(atHour(day.today, PACKED_HOUR), () =>
        packFully(context, forDay, order.reference, day.baked),
      );
    }
  }
  const vehicles = await seedFleet(context);
  await chooseLaboDeparture(context, LABO);
  const vehicleId = vehicles.get(ROUND_VEHICLE);
  if (vehicleId === undefined) {
    throw new Error(`Véhicule « ${ROUND_VEHICLE} » absent de la flotte semée.`);
  }
  const stops = roundStops(day.placed, day.alreadyPacked);
  const round = await composeLoadedRound(
    context,
    { day: forDay, vehicleId, at: atHour(day.today, LOADING_HOUR, LOADING_MINUTE) },
    stops,
  );
  const deliveriesToday = day.placed.length + day.alreadyPacked.length;
  return {
    day: forDay,
    deliveries: day.placed.length,
    deliveriesToday,
    notReady: day.placed.filter((placed) => !placed.entry.ready).length,
    vehicles: FLEET.length,
    rounds: 1,
    stopsInRound: round.stops,
    loadedBags: round.loadedBags,
    unassigned: deliveriesToday - round.stops,
  };
}

/** Les arrêts de la tournée, dans l'ordre de la vallée. */
function roundStops(
  placed: readonly PlacedDelivery[],
  alreadyPacked: readonly PlacedOrder[],
): readonly { readonly orderId: string; readonly bags: number }[] {
  const ranked = placed.flatMap(({ order, entry }) =>
    entry.stop === null ? [] : [{ rank: entry.stop, orderId: order.id, bags: entry.bags ?? 1 }],
  );
  // La Folie Douce commande large : deux sacs.
  const counter = alreadyPacked.map((order) => ({
    rank: COUNTER_DELIVERY_STOP,
    orderId: order.id,
    bags: 2,
  }));
  return [...ranked, ...counter]
    .sort((left, right) => left.rank - right.rank)
    .map(({ orderId, bags }) => ({ orderId, bags }));
}
