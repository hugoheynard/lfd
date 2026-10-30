/**
 * E2E des **rapports du sur mesure** (lot R de
 * `documentation/catalogue/plan-sur-mesure-partout.md`, § 5 ter).
 *
 * Ce que seul le vrai Postgres prouve : les sommes SQL par état du marqueur
 * scellé (`order_lines.made_to_order`), le mois et le jour lus à l'heure de
 * Paris, une ligne d'avant le suivi (`NULL`) tenue à part et jamais comptée
 * comme non sur mesure, le regroupement par société — et le mur `b2b_growth`.
 *
 * Les commandes passent par le vrai chemin (plan T), antidatées à hier
 * matin ; l'article est marqué par la vraie route du staff ; les montants
 * attendus sont relus sur les lignes passées, jamais recopiés.
 */
import {
  addDays,
  instantToLocal,
  localToInstant,
  type MadeToOrderByClientView,
  type MadeToOrderMonthlyView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { staffWith, stubAdminVerifier } from "./operations-at-commerce-scene.js";
import { pickupSite, placeOrder, type PlacedTestOrder } from "./order-factory.js";

const MONTHLY = "/admin/growth/made-to-order/monthly";
const CLIENTS = "/admin/growth/made-to-order/clients";
const STAFF = "staff-e2e";

/** L'article marqué « sur mesure », et un article qui ne l'est jamais. */
const CUSTOM = "VIE-001-1";
const PLAIN = "PAI-001-1";

let ctx: E2eContext;
let seq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Hier, jour métier du serveur — jamais une date écrite en dur. */
function yesterday(): string {
  return addDays(instantToLocal(ctx.app.get(Clock).now()).day, -1);
}

function yesterdayMorning(): Date {
  const at = localToInstant(yesterday(), "08:30");
  if (at === null) {
    throw new Error("8 h 30 existe tous les jours à Paris");
  }
  return at;
}

async function mark(sku: string, madeToOrder: boolean): Promise<void> {
  await ctx
    .asSub(STAFF)
    .put(`/admin/catalog/${sku}/made-to-order`)
    .send({ madeToOrder })
    .expect(204);
}

/** Une société au compte et son détenteur. */
async function proCompany(
  enseigne: string,
): Promise<{ companyId: string; buyerId: string; buyerSub: string }> {
  seq += 1;
  const buyerSub = `auth0|mto-report-${String(seq)}`;
  const buyer = await createUser(ctx.prisma, {
    auth0Sub: buyerSub,
    email: `mto-report-${String(seq)}@example.test`,
  });
  const company = await createCompany(ctx.prisma, { enseigne });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  return { companyId: company.id, buyerId: buyer.id, buyerSub };
}

async function proOrder(
  pro: { companyId: string; buyerId: string },
  lines: readonly { sku: string; quantity: number }[],
): Promise<PlacedTestOrder> {
  return placeOrder(ctx, {
    buyerUserId: pro.buyerId,
    companyId: pro.companyId,
    settlement: "account",
    placedAt: yesterdayMorning(),
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines,
  });
}

/** Le HT d'une ligne, tel que la passation l'a écrit. */
async function lineHt(order: PlacedTestOrder, sku: string): Promise<number> {
  const line = await ctx.prisma.orderLine.findUniqueOrThrow({
    where: { orderId_sku: { orderId: order.id, sku } },
    select: { lineTotalCents: true },
  });
  return line.lineTotalCents;
}

/**
 * Deux sociétés : l'Hôtel commande deux pièces sur mesure et deux pains ; le
 * Chalet trois pièces, dont la ligne est ramenée « d'avant le suivi ».
 */
async function scene(): Promise<{ custom: number; plain: number; legacy: number }> {
  await mark(CUSTOM, true);
  const hotel = await proOrder(await proCompany("Hôtel des Cimes"), [
    { sku: CUSTOM, quantity: 2 },
    { sku: PLAIN, quantity: 2 },
  ]);
  const chalet = await proOrder(await proCompany("Chalet Blanc"), [{ sku: CUSTOM, quantity: 3 }]);
  // Une ligne écrite avant la colonne : on ne savait pas (même geste que M1).
  await ctx.prisma.orderLine.updateMany({
    where: { orderId: chalet.id },
    data: { madeToOrder: null },
  });
  return {
    custom: await lineHt(hotel, CUSTOM),
    plain: await lineHt(hotel, PLAIN),
    legacy: await lineHt(chalet, CUSTOM),
  };
}

describe("le sur mesure par mois", () => {
  it("sépare sur mesure, non sur mesure et d'avant le suivi, et rapporte la part au total", async () => {
    const amounts = await scene();

    const view = jsonBody<MadeToOrderMonthlyView>(await ctx.asSub(STAFF).get(MONTHLY).expect(200));

    expect(view.rows).toHaveLength(12);
    const total = amounts.custom + amounts.plain + amounts.legacy;
    expect(view.rows.find((row) => row.month === yesterday().slice(0, 7))).toEqual({
      month: yesterday().slice(0, 7),
      madeToOrderHtCents: amounts.custom,
      otherHtCents: amounts.plain,
      unknownHtCents: amounts.legacy,
      totalHtCents: total,
      madeToOrderOrders: 1,
      madeToOrderShare: amounts.custom / total,
    });
  });

  it("refuse une autre fenêtre", async () => {
    await ctx.asSub(STAFF).get(`${MONTHLY}?months=7`).expect(400);
  });
});

describe("le sur mesure par client", () => {
  it("rend les articles sur mesure de chaque société, et l'inconnu à part", async () => {
    const amounts = await scene();

    const view = jsonBody<MadeToOrderByClientView>(
      await ctx.asSub(STAFF).get(`${CLIENTS}?from=${yesterday()}&to=${yesterday()}`).expect(200),
    );

    expect(view.madeToOrderHtCents).toBe(amounts.custom);
    expect(view.unknownHtCents).toBe(amounts.legacy);
    expect(view.clients).toEqual([
      expect.objectContaining({
        kind: "company",
        name: "Hôtel des Cimes",
        madeToOrderHtCents: amounts.custom,
        unknownHtCents: 0,
        articles: [
          expect.objectContaining({
            sku: CUSTOM,
            saleUnit: "piece",
            quantity: 2,
            htCents: amounts.custom,
            orders: 1,
          }),
        ],
      }),
      expect.objectContaining({
        name: "Chalet Blanc",
        madeToOrderHtCents: 0,
        unknownHtCents: amounts.legacy,
        articles: [],
      }),
    ]);
  });

  it("ne voit rien hors de la période", async () => {
    await scene();
    const today = instantToLocal(ctx.app.get(Clock).now()).day;

    const view = jsonBody<MadeToOrderByClientView>(
      await ctx.asSub(STAFF).get(`${CLIENTS}?from=${today}&to=${today}`).expect(200),
    );

    expect(view.clients).toEqual([]);
  });

  it("refuse une période à l'envers en nommant le geste", async () => {
    const response = await ctx
      .asSub(STAFF)
      .get(`${CLIENTS}?from=${yesterday()}&to=${addDays(yesterday(), -1)}`)
      .expect(400);
    expect(JSON.stringify(response.body)).toContain("inversez");
  });
});

describe("le mur", () => {
  it("se ferme à qui n'a pas b2b_growth, et au client", async () => {
    const outsider = await staffWith(ctx, "sans-croissance", [
      { resource: "b2b_orders", action: "read" },
    ]);
    const reader = await staffWith(ctx, "lecteur-croissance", [
      { resource: "b2b_growth", action: "read" },
    ]);
    const pro = await proCompany("Client curieux");
    const period = `?from=${yesterday()}&to=${yesterday()}`;

    await ctx.asSub(outsider).get(MONTHLY).expect(403);
    await ctx.asSub(outsider).get(`${CLIENTS}${period}`).expect(403);
    await ctx.asSub(pro.buyerSub).get(`${CLIENTS}${period}`).expect(403);
    await ctx.asSub(reader).get(MONTHLY).expect(200);
    await ctx.asSub(reader).get(`${CLIENTS}${period}`).expect(200);
  });
});
