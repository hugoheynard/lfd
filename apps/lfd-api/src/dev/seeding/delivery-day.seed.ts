import { CLIENT_ENSEIGNE } from "./client.seed.js";
import { BIN_L, BIN_M, BIN_S, type DayBins } from "./delivery-bins.seed.js";
import type { SeedDriverAssignment } from "./delivery-driver.seed.js";
import {
  place,
  type PlacedOrder,
  type SeedContext,
  type SeedLine,
  type SeedWindow,
  type Target,
} from "./order-placing.seed.js";
import { placedByKeys, scenarioOrderKey } from "./scenario-keys.seed.js";

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
 * - **toutes les livraisons colisées en tournées CHARGÉES, pas parties**
 *   (Hugo, 2026-10-05) : Camionnette 1 tient Val d'Isère dans l'ordre de la
 *   vallée, les autres prêtes sont réparties en tranches contiguës sur les
 *   autres véhicules (`spreadOverVehicles`, pas l'algorithme de « Proposer ») ;
 *   seules les pas encore prêtes — sans bac — restent hors tournée.
 */

/** Une livraison du jour, visée par l'enseigne du client. */
export interface DeliveryDayEntry {
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
  readonly lines: readonly SeedLine[];
}

export const DELIVERY_DAY: readonly DeliveryDayEntry[] = [
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
    bins: [{ type: BIN_M, whole: 8, half: false, innerBags: 2 }],
    lines: [
      { sku: "VIE-009", quantity: 20 },
      { sku: "VIE-001", quantity: 18 },
    ],
  },
  // ── Bourg-Saint-Maurice, les Arcs, Séez — répartis sur les autres véhicules ─
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
  // ── La Rosière, Montvalezan — répartis sur les autres véhicules ───────────
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
  /** Les tournées composées et chargées — une par véhicule qui a des arrêts. */
  readonly rounds: number;
  /** Les arrêts, toutes tournées confondues. */
  readonly stops: number;
  /** Les bacs chargés, toutes tournées confondues : tous ceux des arrêts. */
  readonly loadedBins: number;
  /** Les bacs partagés entre deux arrêts consécutifs (v2-4). */
  readonly sharedBins: number;
  /** À qui la tournée chargée est affectée, ou pourquoi elle ne l'est pas. */
  readonly driver: SeedDriverAssignment;
  /** Les livraisons hors tournée : les pas encore prêtes, qui n'ont aucun bac. */
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
  for (const [rank, entry] of DELIVERY_DAY.entries()) {
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
      // La marque par laquelle l'étape du colisage la retrouvera.
      idempotencyKey: scenarioOrderKey(forDay, "delivery", rank),
      ...(entry.deliveryLabel === undefined ? {} : { deliveryLabel: entry.deliveryLabel }),
    });
    placed.push({ order, entry });
  }
  return placed;
}

/**
 * La journée de livraison telle que l'étape 0 l'a posée, relue par ses clés.
 * Refuse si une livraison manque : l'étape suivante ne saurait pas où la mettre.
 */
export async function readDeliveryDay(
  context: SeedContext,
  forDay: string,
): Promise<readonly PlacedDelivery[]> {
  const keys = DELIVERY_DAY.map((_, rank) => scenarioOrderKey(forDay, "delivery", rank));
  const placed = await placedByKeys(context.prisma, keys);
  return DELIVERY_DAY.map((entry, rank) => {
    const order = placed.get(keys[rank] ?? "");
    if (order === undefined) {
      throw new Error(
        `La journée de livraison du ${forDay} est incomplète (« ${entry.enseigne} » absente) : ` +
          "remettre le scénario à l'état de base.",
      );
    }
    return { order, entry };
  });
}

/** Les livraisons qui doivent finir prêtes — les autres restent hors colisage. */
export function deliveriesToPack(placed: readonly PlacedDelivery[]): readonly PlacedDelivery[] {
  return placed.filter(({ entry }) => entry.ready);
}
