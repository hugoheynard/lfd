import { type SeedHarness } from "./harness.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 13;
/** Zones du marché ciblé (les sociétés y portent un secteur NAF). */
const MARKET_CP = ["73150", "73320", "73700"];
/** Commandes créées par semaine (volume de base). */
const PER_WEEK = 12;

/**
 * Phase **revenu historique** : des commandes **datées dans le passé** (13 semaines),
 * rattachées à des sociétés **actives** du marché ciblé (donc porteuses d'un secteur
 * NAF), avec un **CA croissant** — pour alimenter « Marché vs volume » et « CA par
 * secteur NAF dans le temps ».
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

/** Lignes de commande planifiées : étalées sur `WEEKS`, montant croissant, sociétés en round-robin. */
function buildOrders(
  companies: ReadonlyArray<{ id: string }>,
  buyerId: string,
  anchor: Date,
): Array<{
  orderNumber: string;
  placedByUserId: string;
  companyId: string;
  status: "placed";
  fulfillmentMethod: "pickup";
  subtotalCents: number;
  totalCents: number;
  createdAt: Date;
}> {
  const rows = [];
  let k = 0;
  for (let week = 0; week < WEEKS; week += 1) {
    const base = anchor.getTime() - (WEEKS - 1 - week) * 7 * DAY_MS;
    for (let j = 0; j < PER_WEEK; j += 1, k += 1) {
      const company = companies[k % companies.length];
      if (company === undefined) {
        continue;
      }
      // CA croissant : baseline qui monte avec la semaine + variété par commande.
      const amount = 5000 + week * 600 + (k % 6) * 2000;
      rows.push({
        orderNumber: `seed-rev-${k}`,
        placedByUserId: buyerId,
        companyId: company.id,
        status: "placed" as const,
        fulfillmentMethod: "pickup" as const,
        subtotalCents: amount,
        totalCents: amount,
        createdAt: new Date(base + (j % 7) * DAY_MS),
      });
    }
  }
  return rows;
}
