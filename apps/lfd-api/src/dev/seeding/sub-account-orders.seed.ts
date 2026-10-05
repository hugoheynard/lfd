import {
  atHour,
  isoDay,
  place,
  type SeedContext,
  type SeedLine,
  shiftDays,
  targetOf,
} from "./order-placing.seed.js";

/**
 * **Les commandes des sous-comptes** — le mois dernier et ce mois-ci, par le
 * vrai handler, pour que l'onglet Facturation ait deux relevés à comparer.
 *
 * Comme `orders.seed.ts` : les commandes de CES sociétés sont effacées puis
 * reposées, sinon chaque relance en ajouterait. Rien d'autre n'est touché.
 *
 * Les jours de service évitent la fenêtre que le semis du jour tient (hier à
 * J+2) : ses journées de fournil sont arrêtées, colisées, livrées, et une
 * commande de plus y tomberait après coup.
 */

/** Une commande prévue : qui, quand (rang dans le mois), comment, quoi. */
interface PlannedOrder {
  readonly company: string;
  readonly month: "previous" | "current";
  readonly slot: number;
  readonly method: "pickup" | "delivery";
  readonly lines: readonly SeedLine[];
  readonly settlement?: "card";
  readonly paid?: boolean;
}

/** Les sociétés à servir, par nom affiché, et leur identifiant. */
export type OrderingCompanies = ReadonlyMap<string, string>;

export interface SubAccountOrdersReport {
  readonly removed: number;
  readonly placed: number;
}

/** Pain, viennoiserie (5,5 %) et chocolat (20 %) : deux taux par panier. */
const BREAKFAST: readonly SeedLine[] = [
  { sku: "VIE-001", quantity: 12 },
  { sku: "VIE-002", quantity: 10 },
  { sku: "PAI-001", quantity: 6 },
  { sku: "CHO-003", quantity: 2 },
];
const TEA_TIME: readonly SeedLine[] = [
  { sku: "PAI-013", quantity: 4 },
  { sku: "VIE-005", quantity: 6 },
  { sku: "PAI-001", quantity: 8 },
  { sku: "CHO-007", quantity: 1 },
];
/** Un hôtel : beaucoup de croissants — c'est eux qui font avancer le palier. */
const HOTEL_BUFFET: readonly SeedLine[] = [
  { sku: "VIE-001", quantity: 150 },
  { sku: "VIE-002", quantity: 40 },
  { sku: "PAI-001", quantity: 30 },
  { sku: "CHO-007", quantity: 3 },
];

const EDELWEISS = "Chalet Edelweiss";
const MELEZE = "Chalet Mélèze";
const AROLLE = "Chalet Arolle";
export const ALPES = "Alpes Chalets Privés";
const TIGNES = "Hôtel des Cimes Tignes";
const VAL_THORENS = "Hôtel des Cimes Val Thorens";

const PLAN: readonly PlannedOrder[] = [
  { company: EDELWEISS, month: "previous", slot: 0, method: "delivery", lines: BREAKFAST },
  { company: EDELWEISS, month: "previous", slot: 3, method: "delivery", lines: TEA_TIME },
  { company: MELEZE, month: "previous", slot: 1, method: "delivery", lines: TEA_TIME },
  { company: MELEZE, month: "previous", slot: 4, method: "delivery", lines: BREAKFAST },
  { company: AROLLE, month: "previous", slot: 2, method: "delivery", lines: BREAKFAST },
  { company: TIGNES, month: "previous", slot: 0, method: "pickup", lines: HOTEL_BUFFET },
  { company: TIGNES, month: "previous", slot: 3, method: "pickup", lines: HOTEL_BUFFET },
  { company: VAL_THORENS, month: "previous", slot: 1, method: "pickup", lines: HOTEL_BUFFET },
  { company: VAL_THORENS, month: "previous", slot: 4, method: "pickup", lines: HOTEL_BUFFET },
  { company: EDELWEISS, month: "current", slot: 0, method: "delivery", lines: BREAKFAST },
  // ⚠️ Pas de commande GRATUITE : aucun geste n'en produit une pour un pro
  // aujourd'hui. Une mercuriale à 0 € est relevée par le plancher global `pro`
  // (50 %), et les bons de fidélité sont fermés aux pros (`open_to_pro`,
  // réglage local vérifié le 2026-10-05). L'écrire en base serait inventer.
  // Payée par CARTE alors que le compte est accordé : le client l'a choisi.
  {
    company: EDELWEISS,
    month: "current",
    slot: 1,
    method: "delivery",
    lines: TEA_TIME,
    settlement: "card",
    paid: true,
  },
  { company: MELEZE, month: "current", slot: 0, method: "delivery", lines: TEA_TIME },
  { company: AROLLE, month: "current", slot: 1, method: "delivery", lines: TEA_TIME },
  { company: ALPES, month: "current", slot: 0, method: "pickup", lines: BREAKFAST },
  { company: TIGNES, month: "current", slot: 0, method: "pickup", lines: HOTEL_BUFFET },
  { company: VAL_THORENS, month: "current", slot: 1, method: "pickup", lines: HOTEL_BUFFET },
];

/** La tranche du créneau pro du Labo — cf. `orders.seed.ts`. */
const PICKUP_WINDOW = { start: "05:30", end: "06:30" } as const;
const ORDER_HOUR = 9;
/** Les jours de service du mois dernier, régulièrement espacés. */
const PREVIOUS_MONTH_DAYS = [4, 9, 14, 19, 24] as const;

export async function seedSubAccountOrders(
  context: SeedContext,
  companies: OrderingCompanies,
): Promise<SubAccountOrdersReport> {
  const removed = await context.prisma.order.deleteMany({
    where: { companyId: { in: [...companies.values()] } },
  });
  const days = {
    previous: PREVIOUS_MONTH_DAYS.map((day) => dayOfMonth(context.now, -1, day)),
    current: currentMonthDays(context.now),
  };
  // Dans l'ordre du calendrier : le cumul de l'engagement se mesure sur ce qui
  // est déjà commandé, et une commande posée avant sa devancière fausserait le
  // palier qu'on veut voir avancer.
  const dated = PLAN.map((order) => ({ order, forDay: pick(days[order.month], order.slot) }));
  dated.sort((left, right) => left.forDay.getTime() - right.forDay.getTime());
  let placed = 0;
  for (const { order, forDay } of dated) {
    const companyId = companies.get(order.company);
    if (companyId === undefined) {
      throw new Error(`« ${order.company} » n'a pas été semé avant ses commandes.`);
    }
    const target = await targetOf(context, companyId, order.company);
    await place(context, target, {
      at: shiftDays(forDay, -1),
      forDay: isoDay(forDay),
      method: order.method,
      point: null,
      window: order.method === "pickup" ? PICKUP_WINDOW : null,
      lines: order.lines,
      paid: order.paid ?? false,
      ...(order.settlement === undefined ? {} : { settlement: order.settlement }),
    });
    placed += 1;
  }
  return { removed: removed.count, placed };
}

function pick(days: readonly Date[], slot: number): Date {
  const day = days[slot % days.length];
  if (day === undefined) {
    throw new Error("Aucun jour de service disponible ce mois-ci pour les sous-comptes.");
  }
  return day;
}

/** Le jour `day` du mois décalé de `offset`, à l'heure des commandes. */
function dayOfMonth(now: Date, offset: number, day: number): Date {
  const date = atHour(now, ORDER_HOUR);
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  date.setDate(day);
  return date;
}

/**
 * Les jours de ce mois où poser une commande : du 2 (commandée le 1er, donc
 * dans le mois) jusqu'à avant-hier — puis, si le mois est trop jeune, à partir
 * de J+3, après la fenêtre que tient le semis du jour.
 */
export function currentMonthDays(now: Date): readonly Date[] {
  const today = atHour(now, ORDER_HOUR);
  const past: Date[] = [];
  for (let day = 2; day <= today.getDate() - 2; day += 1) {
    past.push(dayOfMonth(now, 0, day));
  }
  if (past.length >= 2) {
    return past;
  }
  const ahead = [3, 4].map((offset) => shiftDays(today, offset));
  return [...past, ...ahead.filter((day) => day.getMonth() === today.getMonth())];
}
