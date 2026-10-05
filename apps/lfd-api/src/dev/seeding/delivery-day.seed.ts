import { CLIENT_ENSEIGNE } from "./client.seed.js";
import {
  BIN_L,
  BIN_M,
  BIN_S,
  type DayBins,
  DEFAULT_BINS,
  resolveBins,
} from "./delivery-bins.seed.js";
import { FLEET, seedFleet } from "./delivery-fleet.seed.js";
import {
  binContainers,
  chooseLaboDeparture,
  composeRound,
  halfBinOf,
  loadRound,
  type RoundStop,
} from "./delivery-rounds.seed.js";
import {
  assignSeedDriver,
  prismaDriverReader,
  type SeedDriverAssignment,
} from "./delivery-driver.seed.js";
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
 * - **une à échéance** (l'Épicerie des Eulets, dont le carnet ne porte pas de
 *   créneau) : « avant 11:00 ». Elle était passée SANS fenêtre jusqu'au
 *   2026-10-03 ; une livraison sans heure est refusée depuis (plan composition
 *   automatique, CA1b) ;
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
  /**
   * Ses bacs, quand elle est dans la tournée — par NOM de type. Absent : un
   * Bac M entier, deux sacs dedans.
   */
  readonly bins?: readonly DayBins[];
  /** Prend l'autre moitié du demi-bac de l'arrêt précédent (v2-4) : les sacs de sa moitié. */
  readonly sharesPreviousHalf?: { readonly innerBags: number };
  /**
   * Ses bacs sont déjà chargés. Absent : à charger. Seuls les derniers arrêts
   * le sont — chargés les premiers —, pour que « Charger » s'ouvre en cours
   * de route, sur un plancher de trois rangées.
   */
  readonly loaded?: boolean;
  readonly lines: readonly SeedLine[];
}

const DELIVERY_DAY: readonly DeliveryDayEntry[] = [
  // ── Val d'Isère — la tournée de Camionnette 1 ─────────────────────────────
  {
    enseigne: "Chalet du Laisinant",
    window: null,
    ready: true,
    stop: 0,
    // Les viennoiseries au frais : un petit isotherme, le pain en Bac M.
    bins: [
      { type: BIN_M, whole: 5, half: false, innerBags: 1 },
      { type: BIN_S, whole: 1, half: false, innerBags: 0 },
    ],
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
    // Un Bac L, et un reste qui tient dans un demi-Bac M — dont l'autre moitié
    // part à l'arrêt suivant, le Petit Chaudron (v2-4, dernier recours).
    bins: [
      { type: BIN_L, whole: 6, half: false, innerBags: 2 },
      { type: BIN_M, whole: 0, half: true, innerBags: 1 },
    ],
    lines: [
      { sku: "PAI-013", quantity: 8 },
      { sku: "PAI-001", quantity: 15 },
    ],
  },
  {
    enseigne: "Le Petit Chaudron",
    // La première de ses deux échéances : le pain du petit-déjeuner.
    window: { start: null, end: "07:30" },
    ready: true,
    stop: 2,
    bins: [{ type: BIN_L, whole: 5, half: false, innerBags: 3 }],
    sharesPreviousHalf: { innerBags: 1 },
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
    bins: [{ type: BIN_L, whole: 8, half: false, innerBags: 2 }],
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
    // Le dernier arrêt, chargé le premier : déjà dans la camionnette.
    bins: [{ type: BIN_M, whole: 8, half: false, innerBags: 2 }],
    loaded: true,
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
    window: { start: null, end: "09:00" },
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
    // Sa seconde échéance, celle de midi, et pas encore prête : la feuille de route doit
    // montrer un bac qui manque sans alarmer pour rien.
    window: { start: null, end: "11:30" },
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
    window: { start: null, end: "11:00" },
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
  readonly loadedBins: number;
  /** Les bacs partagés entre deux arrêts consécutifs (v2-4). */
  readonly sharedBins: number;
  /** À qui la tournée chargée est affectée, ou pourquoi elle ne l'est pas. */
  readonly driver: SeedDriverAssignment;
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
 * Sème la flotte et le départ, compose la tournée de Val d'Isère, colise ce
 * qui doit être prêt, puis charge. À appeler APRÈS le plan du soir.
 *
 * 🔴 **La tournée AVANT le colisage** depuis K3c (`colisage.md`
 * §17.3) : un bac de livraison naît au colisage, et partager une moitié exige
 * deux arrêts consécutifs de la même tournée. Une commande non prête entre
 * dans la tournée — la feuille de route le dit — mais n'a pas de bac.
 */
export async function advanceDeliveryDay(
  context: SeedContext,
  day: {
    readonly today: Date;
    readonly placed: readonly PlacedDelivery[];
    /** Les livraisons du jour déjà colisées ailleurs (le comptoir) — rang 4 de la tournée. */
    readonly alreadyPacked: readonly PlacedOrder[];
    readonly baked: Set<string>;
    /** Les types de bacs semés (`seedBinTypes`), par nom. */
    readonly binTypes: ReadonlyMap<string, string>;
  },
): Promise<DeliveryDayReport> {
  const forDay = isoDay(day.today);
  const vehicles = await seedFleet(context);
  await chooseLaboDeparture(context, LABO);
  const vehicleId = vehicles.get(ROUND_VEHICLE);
  if (vehicleId === undefined) {
    throw new Error(`Véhicule « ${ROUND_VEHICLE} » absent de la flotte semée.`);
  }
  const stops = roundStops(day.placed, day.alreadyPacked);
  const loadedAt = atHour(day.today, LOADING_HOUR, LOADING_MINUTE);
  const roundId = await composeRound(context, { day: forDay, vehicleId, at: loadedAt }, stops);
  const sharedBins = await packDeliveries(context, forDay, day);
  const round = await loadRound(context, { roundId, at: loadedAt }, stops);
  const driver = await assignSeedDriver(
    {
      commands: context.commands,
      reader: prismaDriverReader(context.prisma),
      requester: context.requester,
    },
    { roundId, at: loadedAt },
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
    loadedBins: round.loadedBins,
    sharedBins,
    driver,
    unassigned: deliveriesToday - round.stops,
  };
}

/**
 * Colise les livraisons prêtes, dans l'ordre de la tournée — une moitié se
 * partage avec l'arrêt PRÉCÉDENT, qui doit donc avoir ouvert la sienne.
 * Rend le nombre de moitiés partagées.
 */
async function packDeliveries(
  context: SeedContext,
  forDay: string,
  day: {
    readonly today: Date;
    readonly placed: readonly PlacedDelivery[];
    readonly baked: Set<string>;
    readonly binTypes: ReadonlyMap<string, string>;
  },
): Promise<number> {
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
    const containers = binContainers(resolveBins(day.binTypes, entry.bins ?? DEFAULT_BINS), share);
    await asStaff(atHour(day.today, PACKED_HOUR), () =>
      packFully(context, forDay, order.reference, day.baked, containers),
    );
  }
  return shared;
}

/** Les arrêts de la tournée, dans l'ordre de la vallée — prêts ou non. */
function roundStops(
  placed: readonly PlacedDelivery[],
  alreadyPacked: readonly PlacedOrder[],
): readonly RoundStop[] {
  const ranked = placed.flatMap(({ order, entry }) =>
    entry.stop === null
      ? []
      : [{ rank: entry.stop, orderId: order.id, loaded: entry.loaded === true }],
  );
  const counter = alreadyPacked.map((order) => ({
    rank: COUNTER_DELIVERY_STOP,
    orderId: order.id,
    loaded: false,
  }));
  return [...ranked, ...counter]
    .sort((left, right) => left.rank - right.rank)
    .map(({ rank: _rank, ...stop }) => stop);
}
