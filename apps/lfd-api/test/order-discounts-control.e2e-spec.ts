/**
 * E2E des **remises de panier écrites par la passation et la révision, sous
 * leur contrôle en base** — plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 18.2, § 18.5 et § 18.7, lot M3.
 *
 * Ce que seul le vrai SQL prouve :
 *
 * 1. la passation écrit sa remise dans `order_discounts`, couvertures
 *    comprises, et la somme tient au COMMIT ;
 * 2. la révision archive la remise et en écrit une neuve, dans UNE
 *    transaction : sous le déclencheur différé, une révision qui change
 *    `discount_cents` ne passe que si archivage et insertion valident avec
 *    elle — et un échec en fin de révision défait l'archivage ;
 * 3. le déclencheur `order_discounts_match_order` refuse une commande remisée
 *    sans remise, une somme fausse, des parts incohérentes, l'archivage de la
 *    seule remise active — et admet une remise archivée qui ne somme plus.
 */
import type { AdminPlacedOrderResponse, PlacedOrderResponse } from "@lfd/contracts";
import { htMillicentsOf } from "@lfd/pim-contracts";
import { randomUUID } from "node:crypto";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
  type Prisma,
} from "../src/platform/database/client/client.js";
import { LATEST_DELIVERY_FULFILLMENT } from "./delivery-deadline-fixture.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { frozenDiscountsCreate } from "./order-discount-fixtures.js";
import { poseSiteDiscount } from "./promotion-fixtures.js";

const DAY = serviceDay(7);
const PERSON = "auth0|particulier-controle";
const BUYER = "auth0|acheteur-controle";
/** L'étiquette du banana bread : 21,00 € TTC à 5,5 %. */
const BANANA_LABEL_CENTS = 2_100;
const REFUSED = /order_discounts_match_order/;

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let intents = 0;
const fakeGateway = {
  createIntent: () => {
    intents += 1;
    return Promise.resolve({
      paymentIntentId: `pi_controle_${intents}`,
      clientSecret: `pi_controle_${intents}_s`,
    });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_s`,
      state: "awaiting_payment" as const,
    }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

let ctx: E2eContext;
let pickupId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: PaymentGateway, value: fakeGateway },
      { token: AdminTokenVerifier, value: stubAdminVerifier },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const point = await ctx.prisma.site.create({
    data: {
      label: "Le Labo",
      ligne1: "Route de la Balme",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
  await poseSiteDiscount(ctx.asSub(E2E_STAFF_SUB), pickupId, {
    b2b: { mode: "percent", value: 1_000 },
    b2c: { mode: "percent", value: 1_000 },
  });
});

function content(quantity: number): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001-1", quantity }],
  };
}

interface Pro {
  readonly companyId: string;
  readonly userId: string;
}

async function pro(): Promise<Pro> {
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER, email: "acheteur@controle.fr" });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  return { companyId: company.id, userId: user.id };
}

/** Une société au compte et ses croissants, saisis par l'équipe : `line_ht`, −10 %. */
async function proOrder(quantity = 10): Promise<string> {
  const buyer = await pro();
  return jsonBody<AdminPlacedOrderResponse>(
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/orders")
      .send({
        companyId: buyer.companyId,
        buyerUserId: buyer.userId,
        settlement: "account",
        ...content(quantity),
      })
      .expect(201),
  ).id;
}

/** Un particulier et son banana bread : `exact_ht`, −10 % TTC. */
async function personalOrder(): Promise<string> {
  const htMillicents = htMillicentsOf(BANANA_LABEL_CENTS, 5.5) ?? 0;
  await ctx.prisma.catalogItem.update({
    where: { sku: "VIE-001-1" },
    data: {
      publicTtcCents: BANANA_LABEL_CENTS,
      publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents } },
    },
  });
  await createUser(ctx.prisma, { auth0Sub: PERSON, firstName: "Léa" });
  return jsonBody<PlacedOrderResponse>(
    await ctx
      .asSub(PERSON)
      .post("/orders")
      .send({ idempotencyKey: randomUUID(), salesTerms: null, ...content(1) })
      .expect(201),
  ).id;
}

const activeOf = (orderId: string) =>
  ctx.prisma.orderDiscount.findMany({
    where: { orderId, archivedAt: null },
    include: { coveredLines: true },
    orderBy: { rank: "asc" },
  });

const orderOf = (orderId: string) => ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });

function htSum(shares: Prisma.JsonValue): number {
  return Array.isArray(shares)
    ? shares.reduce<number>(
        (sum, share) =>
          sum +
          (typeof share === "object" && share !== null && !Array.isArray(share)
            ? Number(share["htCents"] ?? 0)
            : 0),
        0,
      )
    : Number.NaN;
}

describe("la passation écrit sa remise (M3)", () => {
  /** Régression : jusqu'à M3, la passation n'écrivait que les colonnes `discount_*`. */
  it("line_ht : une remise computed de rang 1, ses parts, sa couverture, sa promotion", async () => {
    const orderId = await proOrder();
    const order = await orderOf(orderId);
    expect(order.discountCents).toBeGreaterThan(0);

    const [discount, ...others] = await activeOf(orderId);

    expect(others).toEqual([]);
    expect(discount).toMatchObject({
      origin: "computed",
      rank: 1,
      promotionId: order.discountPromotionId,
      amountCents: order.discountCents,
      amountTtcCents: null,
    });
    expect(discount?.adjustment).toEqual(order.discountAdjustment);
    expect(discount?.label).toEqual(order.discountLabel);
    expect(htSum(discount?.vatShares ?? null)).toBe(order.discountCents);
    const lines = await ctx.prisma.orderLine.findMany({ where: { orderId }, select: { id: true } });
    expect(discount?.coveredLines.map((covered) => covered.orderLineId)).toEqual(
      lines.map((line) => line.id),
    );
  });

  it("exact_ht : HT et TTC de la remise, égaux aux colonnes figées", async () => {
    const orderId = await personalOrder();
    const order = await orderOf(orderId);

    const [discount] = await activeOf(orderId);

    expect(discount).toMatchObject({
      amountCents: order.discountCents,
      amountTtcCents: order.discountTtcCents,
      baseCents: BANANA_LABEL_CENTS,
    });
    expect(discount?.vatShares).toEqual([
      {
        rate: 5.5,
        htCents: order.discountCents,
        vatCents: (order.discountTtcCents ?? 0) - order.discountCents,
        ttcCents: order.discountTtcCents,
      },
    ]);
  });
});

describe("la révision archive puis réinsère, dans UNE transaction (M3)", () => {
  function revise(orderId: string, quantity: number) {
    return ctx
      .asSub(BUYER)
      .post(`/orders/${orderId}/revisions`)
      .send({ expectedRevision: 0, ...content(quantity) });
  }

  /**
   * Sous le déclencheur différé, une révision qui CHANGE `discount_cents`
   * n'aboutit que si l'archivage et l'insertion valident avec elle : validée
   * seule, chacune des trois écritures serait refusée.
   */
  it("remise archivée, remise neuve égale au nouveau discount_cents, couvertures réécrites", async () => {
    const orderId = await proOrder(10);
    const before = await orderOf(orderId);
    const [placed] = await activeOf(orderId);

    await revise(orderId, 20).expect(200);

    const after = await orderOf(orderId);
    expect(after.discountCents).not.toBe(before.discountCents);
    const [fresh, ...others] = await activeOf(orderId);
    expect(others).toEqual([]);
    expect(fresh?.id).not.toBe(placed?.id);
    expect(fresh?.amountCents).toBe(after.discountCents);
    const archived = await ctx.prisma.orderDiscount.findUniqueOrThrow({
      where: { id: placed?.id ?? "" },
    });
    expect(archived.archivedAt).not.toBeNull();
    // Les couvertures ACTIVES se lisent par jointure sur la remise non archivée.
    const covered = await ctx.prisma.orderLineDiscount.findMany({
      where: { orderLine: { orderId }, orderDiscount: { archivedAt: null } },
    });
    const lines = await ctx.prisma.orderLine.findMany({ where: { orderId }, select: { id: true } });
    expect(covered.map((row) => row.orderLineId)).toEqual(lines.map((line) => line.id));
    expect(
      await ctx.prisma.orderLineDiscount.count({ where: { orderDiscountId: placed?.id ?? "" } }),
    ).toBe(0);
  });

  /**
   * L'historique s'écrit APRÈS l'archivage : une ligne d'historique déjà là
   * (révision concurrente) le fait échouer, et rien de la révision ne reste —
   * ni `discount_cents`, ni l'archivage, ni la remise neuve.
   */
  it("un échec en fin de révision défait l'archivage et la remise neuve", async () => {
    const orderId = await proOrder(10);
    const before = await orderOf(orderId);
    const [placed] = await activeOf(orderId);
    await ctx.prisma.orderRevisionEntry.create({
      data: {
        orderId,
        replacedRevision: 0,
        composition: {},
        changes: [],
        totalBeforeCents: before.totalCents,
        totalAfterCents: before.totalCents,
        revisedByKind: "customer",
        revisedByUserId: before.placedByUserId,
        revisedAt: before.createdAt,
      },
    });

    const response = await revise(orderId, 20);

    expect(response.status).not.toBe(200);
    expect((await orderOf(orderId)).discountCents).toBe(before.discountCents);
    expect((await activeOf(orderId)).map((discount) => discount.id)).toEqual([placed?.id]);
    expect(await ctx.prisma.orderDiscount.count({ where: { orderId } })).toBe(1);
  });
});

describe("le déclencheur order_discounts_match_order", () => {
  /**
   * Différé, le refus tombe au COMMIT — et Prisma n'en rend alors qu'un
   * « Transaction already closed », sans le message de la base. Pour lire QUI
   * refuse, les cas ci-dessous rendent le contrôle immédiat le temps de leur
   * transaction (`SET CONSTRAINTS … IMMEDIATE`) : même fonction, jugée à la
   * fin de l'instruction. Le premier cas éprouve le différé lui-même.
   */
  async function immediately(
    work: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<unknown> {
    return ctx.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SET CONSTRAINTS order_discounts_match_order_on_orders, order_discounts_match_order_on_discounts IMMEDIATE",
      );
      return work(tx);
    });
  }

  const LEGACY_NUMBER = "ORD-910001";

  /** Une commande pro écrite à la main, hors agrégat, avec `discount_cents` donné. */
  async function legacyOrder(
    client: Pick<Prisma.TransactionClient, "order">,
    discountCents: number,
    discounts: Prisma.OrderDiscountCreateNestedManyWithoutOrderInput,
  ): Promise<{ readonly id: string }> {
    const buyer = await pro();
    return client.order.create({
      data: {
        vatMethod: "line_ht",
        orderNumber: LEGACY_NUMBER,
        companyId: buyer.companyId,
        placedByUserId: buyer.userId,
        subtotalCents: 10_000,
        discountCents,
        vatCents: 0,
        totalCents: 10_000 - discountCents,
        status: "placed",
        paymentStatus: "not_required",
        fulfillment: LATEST_DELIVERY_FULFILLMENT,
        discounts,
      },
      select: { id: true },
    });
  }

  function discount(over: Partial<Prisma.OrderDiscountCreateWithoutOrderInput> = {}) {
    return {
      id: randomUUID(),
      origin: "frozen",
      rank: 1,
      baseCents: 500,
      amountCents: 500,
      vatShares: [{ rate: 5.5, htCents: 500 }],
      ...over,
    };
  }

  it("différé : une commande remisée sans remise est refusée au COMMIT, rien n'est écrit", async () => {
    await expect(legacyOrder(ctx.prisma, 500, {})).rejects.toThrow();

    expect(await ctx.prisma.order.count({ where: { orderNumber: LEGACY_NUMBER } })).toBe(0);
  });

  it("refuse une commande remisée sans remise", async () => {
    await expect(immediately((tx) => legacyOrder(tx, 500, {}))).rejects.toThrow(REFUSED);
  });

  it("refuse une somme de remises qui n'est pas discount_cents", async () => {
    await expect(
      immediately((tx) => legacyOrder(tx, 500, frozenDiscountsCreate(400, 5.5))),
    ).rejects.toThrow(REFUSED);
  });

  /** Une commande remisée et sa remise valides, puis ses parts réécrites sous le contrôle immédiat. */
  async function withShares(update: Prisma.OrderDiscountUpdateManyMutationInput): Promise<unknown> {
    const created = await legacyOrder(ctx.prisma, 500, { create: [discount()] });
    return immediately((tx) =>
      tx.orderDiscount.updateMany({ where: { orderId: created.id }, data: update }),
    );
  }

  it("refuse des parts dont la somme n'est pas le montant de la remise", async () => {
    const shares = [
      { rate: 5.5, htCents: 300 },
      { rate: 20, htCents: 100 },
    ];

    await expect(withShares({ vatShares: shares })).rejects.toThrow(/parts par taux incohérentes/);
  });

  it("refuse des parts dont le TTC n'est porté que par certaines", async () => {
    const shares = [
      { rate: 5.5, htCents: 300, ttcCents: 317 },
      { rate: 20, htCents: 200 },
    ];

    await expect(withShares({ amountTtcCents: 557, vatShares: shares })).rejects.toThrow(
      /parts par taux incohérentes/,
    );
  });

  it("admet des parts complètes en TTC qui somment le TTC de la remise", async () => {
    const shares = [
      { rate: 5.5, htCents: 300, ttcCents: 317 },
      { rate: 20, htCents: 200, ttcCents: 240 },
    ];

    await expect(withShares({ amountTtcCents: 557, vatShares: shares })).resolves.toEqual({
      count: 1,
    });
  });

  it("admet une remise archivée qui ne somme plus, à côté de l'active qui somme", async () => {
    const archived = discount({
      amountCents: 300,
      vatShares: [{ rate: 5.5, htCents: 300 }],
      archivedAt: new Date(0),
    });

    const created = await legacyOrder(ctx.prisma, 500, { create: [discount(), archived] });

    expect(await ctx.prisma.orderDiscount.count({ where: { orderId: created.id } })).toBe(2);
  });

  it("une commande sans remise n'a besoin d'aucune ligne", async () => {
    const created = await legacyOrder(ctx.prisma, 0, {});

    expect((await orderOf(created.id)).discountCents).toBe(0);
  });

  it("refuse l'archivage de la seule remise active, et discount_cents réécrit seul", async () => {
    const orderId = await proOrder();
    const order = await orderOf(orderId);

    await expect(
      immediately((tx) =>
        tx.orderDiscount.updateMany({
          where: { orderId, archivedAt: null },
          data: { archivedAt: order.createdAt },
        }),
      ),
    ).rejects.toThrow(REFUSED);
    await expect(
      immediately((tx) =>
        tx.order.update({
          where: { id: orderId },
          data: { discountCents: order.discountCents + 1 },
        }),
      ),
    ).rejects.toThrow(REFUSED);
    expect((await orderOf(orderId)).discountCents).toBe(order.discountCents);
    expect(await activeOf(orderId)).toHaveLength(1);
  });
});
