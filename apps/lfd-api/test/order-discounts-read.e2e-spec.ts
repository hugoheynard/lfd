/**
 * E2E de **la lecture d'une commande à plusieurs remises** — plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 18.6, lot M6.
 *
 * Ce que seul le vrai Postgres prouve : la vue client, la vue du personnel et
 * le bon de commande relisent `order_discounts` (remises actives seulement),
 * et retombent sur les colonnes pour une commande non reprise — le repli
 * unique. Avec UNE remise, aucune des trois ne change : la clé `discounts`
 * reste absente.
 *
 * ⚠️ Deux remises sur une commande ne se posent pas encore par le vrai chemin
 * (le refus `assertSingleBasketPromotion` tombe au lot M7) : la seconde est
 * écrite par Prisma, dans la transaction qui garde le contrôle des remises
 * vrai (somme = `discount_cents`, déclencheur différé) — comme l'e2e de M5.
 */
import { randomUUID } from "node:crypto";

import type { ClientSheet, CustomerOrderView, OrderDiscountView } from "@lfd/contracts";

import type { E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { asPlacedBeforeM3 } from "./order-discount-fixtures.js";
import { pickupSite } from "./order-factory.js";
import { bootstrapProductionDay, MEMBER, STAFF } from "./production-day-fixture.js";
import { poseSiteDiscount } from "./promotion-fixtures.js";
import { accountOrder, type Drawn } from "./shortfall-decision-scene.js";

const SECOND_LABEL = { fr: "Fidélité du fournil", en: "Bakery loyalty", it: "Fedeltà" };
const SECOND_CENTS = 10;
const STRANGER = "stranger-e2e";

let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const ten = { mode: "percent" as const, value: 1_000 };
  await poseSiteDiscount(ctx.asSub(STAFF), await pickupSite(ctx.prisma), { b2b: ten, b2c: ten });
});

/** Une seconde remise, montant fixe, sur les lignes de la première — jugée au COMMIT. */
async function addSecondDiscount(order: Drawn): Promise<void> {
  await ctx.prisma.$transaction(async (tx) => {
    const first = await tx.orderDiscount.findFirstOrThrow({
      where: { orderId: order.id, archivedAt: null },
      include: { coveredLines: true },
    });
    const row = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    await tx.order.update({
      where: { id: order.id },
      data: {
        discountCents: row.discountCents + SECOND_CENTS,
        totalCents: row.totalCents - SECOND_CENTS,
      },
    });
    await tx.orderDiscount.create({
      data: {
        id: randomUUID(),
        orderId: order.id,
        origin: "computed",
        rank: 2,
        promotionId: "promo_e2e_second",
        adjustment: { mode: "amount", cents: SECOND_CENTS },
        label: SECOND_LABEL,
        baseCents: first.baseCents - first.amountCents,
        amountCents: SECOND_CENTS,
        vatShares: [{ rate: 5.5, htCents: SECOND_CENTS }],
        coveredLines: {
          create: first.coveredLines.map((line) => ({ orderLineId: line.orderLineId })),
        },
      },
    });
  });
}

async function customerView(orderId: string): Promise<CustomerOrderView> {
  const res = await ctx.asSub(MEMBER).get(`/orders/${orderId}`);
  expect(res.status).toBe(200);
  return res.body as CustomerOrderView;
}

async function adminView(orderId: string): Promise<CustomerOrderView> {
  const res = await ctx.asSub(STAFF).get(`/admin/orders/${orderId}`);
  expect(res.status).toBe(200);
  return res.body as CustomerOrderView;
}

async function clientSheet(orderId: string): Promise<ClientSheet> {
  const res = await ctx.asSub(MEMBER).get(`/orders/${orderId}/bon`);
  expect(res.status).toBe(200);
  return res.body as ClientSheet;
}

describe("une seule remise : la lecture d'hier", () => {
  it("reprise ou non, ni la vue client, ni la vue staff, ni le bon ne portent de liste", async () => {
    const order = await accountOrder(ctx, 3);
    const before = await customerView(order.id);
    expect(before.discountCents).toBeGreaterThan(0);
    expect(before).not.toHaveProperty("discounts");
    expect(await adminView(order.id)).not.toHaveProperty("discounts");
    expect((await clientSheet(order.id)).money).not.toHaveProperty("discountLines");

    await asPlacedBeforeM3(ctx.prisma, order.id);
    const notReprise = await customerView(order.id);
    expect(notReprise).not.toHaveProperty("discounts");
    expect(notReprise.discountCents).toBe(before.discountCents);
  });
});

describe("deux remises : une entrée par remise, dans l'ordre", () => {
  it("la vue client, la vue staff et le bon disent chacune, et leur somme est la remise", async () => {
    const order = await accountOrder(ctx, 3);
    await addSecondDiscount(order);

    const view = await customerView(order.id);
    const discounts: readonly OrderDiscountView[] = view.discounts ?? [];
    expect(discounts).toHaveLength(2);
    expect(discounts.reduce((sum, d) => sum + d.amountCents, 0)).toBe(view.discountCents);
    expect(discounts[1]).toEqual({
      label: SECOND_LABEL,
      adjustment: { mode: "amount", cents: SECOND_CENTS },
      amountCents: SECOND_CENTS,
      amountTtcCents: null,
    });
    expect((await adminView(order.id)).discounts).toEqual(discounts);

    const lines = (await clientSheet(order.id)).money.discountLines ?? [];
    expect(lines.map((line) => line.cents)).toEqual(discounts.map((d) => d.amountCents));
    expect(lines[1]?.label).toBe(SECOND_LABEL.fr);
  });

  it("une remise archivée n'est pas relue", async () => {
    const order = await accountOrder(ctx, 3);
    await addSecondDiscount(order);
    await asPlacedBeforeM3(ctx.prisma, order.id);

    expect(await customerView(order.id)).not.toHaveProperty("discounts");
  });

  it("le mur : un client d'une autre société ne lit pas la commande", async () => {
    const order = await accountOrder(ctx, 3);
    await addSecondDiscount(order);
    const other = await createCompany(ctx.prisma);
    const stranger = await createUser(ctx.prisma, { auth0Sub: STRANGER });
    await attachTo(ctx.prisma, stranger.id, other.id);

    expect((await ctx.asSub(STRANGER).get(`/orders/${order.id}`)).status).toBe(404);
  });
});
