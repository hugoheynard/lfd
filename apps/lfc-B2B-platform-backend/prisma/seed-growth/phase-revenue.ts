import { type SeedHarness } from "./harness.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Fenêtre historique (jours) — couvre les 13 semaines du dashboard. */
const SPAN_DAYS = 90;
/** Zones du marché ciblé (les sociétés y portent un secteur NAF). */
const MARKET_CP = ["73150", "73320", "73700"];

/** Ligne de commande backdatée (insertion directe, pas le handler PlaceOrder). */
interface RevenueRow {
  orderNumber: string;
  placedByUserId: string;
  companyId: string;
  status: "placed";
  fulfillmentMethod: "pickup";
  subtotalCents: number;
  totalCents: number;
  fromSubscriptionId: string | null;
  createdAt: Date;
}

/**
 * Phase **revenu historique** : des commandes **datées dans le passé** (90 jours),
 * rattachées à des sociétés **actives** du marché ciblé (donc porteuses d'un secteur
 * NAF). Densité **quotidienne** (plusieurs commandes/jour, toutes sociétés en
 * round-robin → le grain jour est lisible), **volume et panier croissants** dans le
 * temps, et une **part récurrente croissante** (`fromSubscriptionId`) — pour alimenter
 * « CA dans le temps », « CA vs nb de commandes » (panier moyen) et « CA par type ».
 *
 * Insertion DIRECTE (pas le handler `PlaceOrder`) : c'est le SEUL moyen de **backdater
 * `createdAt`** (le handler force `now()`) et de rattacher à une société sans franchir
 * le mur d'appartenance. Ces commandes n'émettent pas d'événement de journal → elles
 * n'affectent que les vues CA (order table), pas l'acquisition/prospects (journal).
 * Idempotent (`orderNumber` unique + `skipDuplicates`). Nettoyées par reset via `companyId`.
 */
export async function seedRevenue(harness: SeedHarness, anchor: Date): Promise<number> {
  const companies = await harness.prisma.company.findMany({
    where: {
      status: "active",
      nafCode: { not: "" },
      addresses: { some: { codePostal: { in: MARKET_CP } } },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const buyer = await harness.prisma.user.findFirst({ select: { id: true } });
  if (companies.length === 0 || buyer === null) {
    return 0;
  }
  const rows = buildOrders(companies, buyer.id, anchor);
  const result = await harness.prisma.order.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

/** Densité + panier + part récurrente croissants ; sociétés en round-robin par jour. */
function buildOrders(
  companies: ReadonlyArray<{ id: string }>,
  buyerId: string,
  anchor: Date,
): RevenueRow[] {
  const rows: RevenueRow[] = [];
  let k = 0;
  for (let d = 0; d <= SPAN_DAYS; d += 1) {
    const week = Math.floor(d / 7);
    const createdAt = new Date(anchor.getTime() - (SPAN_DAYS - d) * DAY_MS);
    const perDay = 4 + Math.floor(week / 2); // 4 → 10 commandes/jour
    const recurringSlots = Math.min(perDay, Math.floor(week / 2)); // part récurrente croissante
    for (let n = 0; n < perDay; n += 1, k += 1) {
      const company = companies[k % companies.length];
      if (company === undefined) {
        continue;
      }
      const amount = 4000 + week * 450 + (n % 4) * 1500; // panier croissant + variété
      rows.push({
        orderNumber: `seed-rev-${k}`,
        placedByUserId: buyerId,
        companyId: company.id,
        status: "placed",
        fulfillmentMethod: "pickup",
        subtotalCents: amount,
        totalCents: amount,
        fromSubscriptionId: n < recurringSlots ? `seed-sub-${company.id}` : null,
        createdAt,
      });
    }
  }
  return rows;
}
