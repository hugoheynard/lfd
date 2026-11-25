/**
 * E2E des **bons de livraison et des remises de panier** — `documentation/promotions/promotions.md`, § 2.11,
 * et rectification du 2026-10-31, lot M4.
 *
 * Ce que seul le vrai Postgres prouve :
 *
 * 1. le bon partiel se recompose remise par remise, lue par le repli partagé
 *    — la table pour une commande reprise, les colonnes pour une commande
 *    qui ne l'est pas (jamais `order_discounts` seule) ;
 * 2. au départ d'un bon, sa part par remise s'écrit dans
 *    `delivery_note_discounts`, sous sa FK vers la remise de commande, dans
 *    la transaction du retrait ; une commande non reprise n'en a pas ;
 * 3. un montant fixe est compté entier sur le BL, borné à son assiette
 *    (dette existante, § 18.2).
 *
 * La scène est celle du manque décidé (`shortfall-decision-scene.ts`) : 3
 * croissants commandés au compte, 1 au bac, le reste abandonné.
 */
import { discountCentsOf, type CartAdjustment } from "@lfd/contracts";
import { lineTotalCents, saleQuantity, ttcCentsFromHtMillicents } from "@lfd/money";

import type { E2eContext } from "./e2e-harness.js";
import { asPlacedBeforeM3 } from "./order-discount-fixtures.js";
import { handOver, pickupSite } from "./order-factory.js";
import { bootstrapProductionDay, closeOrder, CROISSANT, STAFF } from "./production-day-fixture.js";
import { poseSiteDiscount, type SiteDiscount } from "./promotion-fixtures.js";
import { accountOrder, decide, report, type Drawn } from "./shortfall-decision-scene.js";

const TEN_PERCENT: SiteDiscount = { mode: "percent", value: 1_000 };
const FIVE_EUROS: SiteDiscount = { mode: "amount", value: 500 };

let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** La remise du point de retrait de la scène, pour les deux clientèles. */
async function discountAtPickup(discount: SiteDiscount): Promise<void> {
  await poseSiteDiscount(ctx.asSub(STAFF), await pickupSite(ctx.prisma), {
    b2b: discount,
    b2c: discount,
  });
}

/** 3 croissants commandés, 1 au bac, le reste abandonné : le BL-1 prévu est partiel. */
async function decidedOrder(before?: (order: Drawn) => Promise<void>): Promise<Drawn> {
  const order = await accountOrder(ctx, 1);
  const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(row.discountCents).toBeGreaterThan(0);
  await before?.(order);
  expect(await report(ctx, order.id)).toBe(204);
  expect((await decide(ctx, order.id)).status).toBe(204);
  expect(await closeOrder(ctx, order.id)).toBe(204);
  await ctx.drain();
  return order;
}

/** Le HT de `quantity` croissants, par l'arrondi du bon partiel (`lineTotalCents`). */
async function croissantHt(orderId: string, quantity = 1): Promise<number> {
  const line = await ctx.prisma.orderLine.findFirstOrThrow({ where: { orderId, sku: CROISSANT } });
  return lineTotalCents(line.unitPriceMillicents, saleQuantity(quantity, "piece"));
}

function noteOf(orderId: string, rank: number) {
  return ctx.prisma.deliveryNote.findFirstOrThrow({
    where: { orderId, rank },
    include: { discounts: true },
  });
}

function activeDiscountsOf(orderId: string) {
  return ctx.prisma.orderDiscount.findMany({ where: { orderId, archivedAt: null } });
}

describe("le BL-1 partiel et sa part de remise (line_ht)", () => {
  it("commande reprise, % : le bon remet sa remise sur ce qui part, et la part s'écrit au retrait", async () => {
    await discountAtPickup(TEN_PERCENT);
    const order = await decidedOrder();
    const expected = discountCentsOf(adjustmentOf(TEN_PERCENT), await croissantHt(order.id));

    const planned = await noteOf(order.id, 1);
    expect(planned.discountCents).toBe(expected);
    // Pas encore parti : ses lignes peuvent encore changer.
    expect(planned.discounts).toEqual([]);

    await handOver(ctx, order);

    const note = await noteOf(order.id, 1);
    const [active] = await activeDiscountsOf(order.id);
    expect(note.status).toBe("handed_over");
    expect(note.discounts).toHaveLength(1);
    expect(note.discounts[0]).toMatchObject({
      orderDiscountId: active?.id,
      amountCents: expected,
      amountTtcCents: null,
      vatShares: [{ rate: 5.5, htCents: expected }],
    });
  });

  /**
   * Régression de conception (rectification du 2026-10-31) : un lecteur qui
   * lirait `order_discounts` seule rendrait un BL partiel SANS remise pour
   * une commande non reprise. Le repli lit ses colonnes, comme une remise
   * de rang 1 ; et il n'y a pas de ligne à citer, donc pas de part.
   */
  it("commande non reprise : la remise lue dans les colonnes, aucune part écrite", async () => {
    await discountAtPickup(TEN_PERCENT);
    const order = await decidedOrder((placed) => asPlacedBeforeM3(ctx.prisma, placed.id));
    const expected = discountCentsOf(adjustmentOf(TEN_PERCENT), await croissantHt(order.id));
    expect(await activeDiscountsOf(order.id)).toEqual([]);

    await handOver(ctx, order);

    const note = await noteOf(order.id, 1);
    expect(note.status).toBe("handed_over");
    expect(note.discountCents).toBe(expected);
    expect(note.discounts).toEqual([]);
  });

  it("montant fixe : compté sur le BL-1, borné à l'assiette qui part — la dette d'hier, pas pire", async () => {
    await discountAtPickup(FIVE_EUROS);
    const order = await decidedOrder();
    const expected = discountCentsOf(adjustmentOf(FIVE_EUROS), await croissantHt(order.id));

    await handOver(ctx, order);

    const note = await noteOf(order.id, 1);
    expect(note.discountCents).toBe(expected);
    expect(note.discounts.map((part) => part.amountCents)).toEqual([expected]);
  });
});

describe("le BL-1 partiel d'une commande composée en TTC (exact_ht)", () => {
  it("la part porte le HT et le TTC de la remise du bon, parts par taux complètes", async () => {
    await discountAtPickup(TEN_PERCENT);
    const order = await decidedOrder((placed) => markExact(placed.id));

    await handOver(ctx, order);

    const note = await noteOf(order.id, 1);
    expect(note.vatMethod).toBe("exact_ht");
    expect(note.discountTtcCents).toBeGreaterThan(0);
    expect(note.discounts).toHaveLength(1);
    expect(note.discounts[0]).toMatchObject({
      amountCents: note.discountCents,
      amountTtcCents: note.discountTtcCents,
    });
  });
});

function adjustmentOf(discount: SiteDiscount): CartAdjustment {
  return discount.mode === "percent"
    ? { mode: "percent", bp: discount.value }
    : { mode: "amount", cents: discount.value };
}

/**
 * La commande composée en TTC — la méthode d'`exact-ht-partial-note.e2e-spec.ts`
 * (écriture brute datée du 2026-10-31 : aucun chemin ne mène un particulier au
 * colisage décidé). Seuls la méthode et les TTC figés sont lus par le BL partiel.
 */
async function markExact(orderId: string): Promise<void> {
  const lines = await ctx.prisma.orderLine.findMany({ where: { orderId } });
  for (const line of lines) {
    const label = ttcCentsFromHtMillicents(line.unitPriceMillicents, line.vatRate.toNumber());
    await ctx.prisma.orderLine.update({
      where: { id: line.id },
      data: { unitPriceTtcCents: label, lineTotalTtcCents: label * line.quantity },
    });
  }
  const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  await ctx.prisma.order.update({
    where: { id: orderId },
    data: {
      vatMethod: "exact_ht",
      discountTtcCents: Math.round(row.discountCents * 1.055),
      voucherTtcCents: 0,
      deliveryFeeTtcCents: 0,
    },
  });
}
