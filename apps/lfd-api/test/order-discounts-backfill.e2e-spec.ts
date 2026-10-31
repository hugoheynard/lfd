/**
 * E2E de la **reprise des remises de panier** — plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 18.3 et § 18.7 (lot M2).
 *
 * Ce que seul le vrai SQL prouve : les trois tables neuves et leurs
 * contraintes, une commande passée par le vrai chemin reprise en `computed`
 * au centime, un écart injecté repris en `frozen` et listé, une seconde passe
 * sans effet, l'index partiel contre une double écriture — et la révision
 * d'une commande reprise, qui supprime et recrée ses lignes, toujours admise.
 *
 * Depuis M3, la passation écrit elle-même sa remise et un déclencheur refuse
 * une commande remisée sans elle : une commande « d'avant » se fabrique par
 * `asPlacedBeforeM3` (ses remises archivées, le contrôle suspendu le temps de
 * la transaction), un écart ou un désaccord par `withoutDiscountControl`.
 */
import type { AdminPlacedOrderResponse, PlacedOrderResponse } from "@lfd/contracts";
import { htMillicentsOf } from "@lfd/pim-contracts";
import { randomUUID } from "node:crypto";

import { PrismaOrderDiscountBackfill } from "../src/b2b/orders/infrastructure/prisma-order-discount-backfill.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { IdGenerator } from "../src/platform/id/id-generator.js";
import { Clock } from "../src/platform/time/clock.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { asPlacedBeforeM3, withoutDiscountControl } from "./order-discount-fixtures.js";
import { poseSiteDiscount } from "./promotion-fixtures.js";

const DAY = serviceDay(7);
const PERSON = "auth0|particulier-reprise";
const BUYER = "auth0|acheteur-reprise";
/** L'étiquette du banana bread : 21,00 € TTC à 5,5 %. */
const BANANA_LABEL_CENTS = 2_100;

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let intents = 0;
const fakeGateway = {
  createIntent: () => {
    intents += 1;
    return Promise.resolve({
      paymentIntentId: `pi_reprise_${intents}`,
      clientSecret: `pi_reprise_${intents}_s`,
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

const backfill = (): PrismaOrderDiscountBackfill =>
  new PrismaOrderDiscountBackfill(
    ctx.prisma,
    ctx.app.get(IdGenerator, { strict: false }),
    ctx.app.get(Clock, { strict: false }),
  );

async function runPass(write: boolean) {
  const runner = backfill();
  const lines = [];
  for (const id of await runner.pendingOrderIds()) {
    lines.push(await runner.recover(id, write));
  }
  return lines;
}

/** Les remises ACTIVES : celles qu'une commande d'avant M3 n'avait pas. */
const discountsOf = (orderId: string) =>
  ctx.prisma.orderDiscount.findMany({
    where: { orderId, archivedAt: null },
    include: { coveredLines: true },
  });

const activeCount = () => ctx.prisma.orderDiscount.count({ where: { archivedAt: null } });

/** Un particulier commande un banana bread au Labo : `exact_ht`, −10 % TTC. */
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
  const placed = jsonBody<PlacedOrderResponse>(
    await ctx
      .asSub(PERSON)
      .post("/orders")
      .send({ idempotencyKey: randomUUID(), salesTerms: null, ...content() })
      .expect(201),
  );
  await asPlacedBeforeM3(ctx.prisma, placed.id);
  return placed.id;
}

/** Une société au compte et sa commande de 10 croissants, saisie par l'équipe : `line_ht`. */
async function proOrder(): Promise<string> {
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER, email: "acheteur@reprise.fr" });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  const placed = jsonBody<AdminPlacedOrderResponse>(
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/orders")
      .send({
        companyId: company.id,
        buyerUserId: user.id,
        settlement: "account",
        ...content({ quantity: 10 }),
      })
      .expect(201),
  );
  await asPlacedBeforeM3(ctx.prisma, placed.id);
  return placed.id;
}

function content(over: { readonly quantity?: number } = {}): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001-1", quantity: over.quantity ?? 1 }],
  };
}

describe("une commande passée par le vrai chemin", () => {
  it("exact_ht : une ligne computed qui redonne le TTC figé, ses parts et sa couverture", async () => {
    const orderId = await personalOrder();
    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.discountTtcCents).toBe(210);

    const report = await runPass(true);

    expect(report.map((line) => line.outcome)).toEqual([{ kind: "computed", gap: null }]);
    const [discount] = await discountsOf(orderId);
    expect(discount).toMatchObject({
      origin: "computed",
      rank: 1,
      amountCents: order.discountCents,
      amountTtcCents: 210,
      baseCents: BANANA_LABEL_CENTS,
      promotionId: order.discountPromotionId,
      archivedAt: null,
    });
    expect(discount?.adjustment).toEqual(order.discountAdjustment);
    expect(discount?.label).toEqual(order.discountLabel);
    expect(discount?.vatShares).toEqual([
      {
        rate: 5.5,
        htCents: order.discountCents,
        vatCents: 210 - order.discountCents,
        ttcCents: 210,
      },
    ]);
    const lines = await ctx.prisma.orderLine.findMany({ where: { orderId }, select: { id: true } });
    expect(discount?.coveredLines.map((covered) => covered.orderLineId)).toEqual(
      lines.map((l) => l.id),
    );
  });

  it("line_ht : une ligne computed dont les parts somment discount_cents", async () => {
    const orderId = await proOrder();
    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.discountCents).toBeGreaterThan(0);

    await runPass(true);

    const [discount] = await discountsOf(orderId);
    expect(discount).toMatchObject({
      origin: "computed",
      amountCents: order.discountCents,
      amountTtcCents: null,
    });
    expect(discount?.vatShares).toEqual([{ rate: 5.5, htCents: order.discountCents }]);
  });
});

describe("la passe", () => {
  it("à blanc : le même verdict, rien d'écrit", async () => {
    await proOrder();

    const report = await runPass(false);

    expect(report.map((line) => line.outcome.kind)).toEqual(["computed"]);
    expect(await activeCount()).toBe(0);
  });

  it("une seconde passe ne reprend rien ; une écriture concurrente se voit sautée", async () => {
    const orderId = await proOrder();
    await runPass(true);

    expect(await runPass(true)).toEqual([]);
    expect(await backfill().recover(orderId, true)).toMatchObject({ outcome: { kind: "already" } });
    expect(await activeCount()).toBe(1);
  });

  it("un écart injecté : ligne frozen recopiée des colonnes, listée", async () => {
    const orderId = await proOrder();
    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const injected = order.discountCents + 1;
    await withoutDiscountControl(ctx.prisma, async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { discountCents: injected } });
    });

    const report = await runPass(true);

    expect(report).toEqual([
      {
        orderNumber: order.orderNumber,
        outcome: {
          kind: "frozen",
          gap: `remise recomposée ${order.discountCents} c HT, figée ${injected} c HT`,
        },
      },
    ]);
    const [discount] = await discountsOf(orderId);
    expect(discount).toMatchObject({ origin: "frozen", amountCents: injected });
    expect(discount?.vatShares).toEqual([{ rate: 5.5, htCents: injected }]);
  });

  it("une commande révisée après sa reprise se signale en désaccord, sans être réécrite", async () => {
    const orderId = await proOrder();
    await runPass(true);
    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    await withoutDiscountControl(ctx.prisma, async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { discountCents: order.discountCents * 2 },
      });
    });

    expect(await runPass(true)).toEqual([]);
    expect(await backfill().drifted()).toEqual([
      {
        orderId,
        orderNumber: order.orderNumber,
        discountCents: order.discountCents * 2,
        activeCents: order.discountCents,
      },
    ]);
  });
});

describe("--refresh-drifted (M3)", () => {
  /** Le désaccord qu'une révision par le code de M2 laissait : `discount_cents` réécrit seul. */
  async function drift(orderId: string, discountCents: number): Promise<void> {
    await withoutDiscountControl(ctx.prisma, async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { discountCents } });
    });
  }

  it("archive la remise périmée et reprend la commande — à blanc d'abord", async () => {
    const orderId = await proOrder();
    await runPass(true);
    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const [stale] = await discountsOf(orderId);
    const drifted = order.discountCents + 1;
    await drift(orderId, drifted);

    expect(await backfill().refresh(orderId, false)).toMatchObject({
      outcome: { kind: "frozen" },
    });
    expect((await discountsOf(orderId)).map((discount) => discount.id)).toEqual([stale?.id]);

    await backfill().refresh(orderId, true);

    const [fresh] = await discountsOf(orderId);
    expect(fresh).toMatchObject({ origin: "frozen", amountCents: drifted });
    expect(fresh?.id).not.toBe(stale?.id);
    const archived = await ctx.prisma.orderDiscount.findUniqueOrThrow({
      where: { id: stale?.id ?? "" },
    });
    expect(archived.archivedAt).not.toBeNull();
    expect(await backfill().drifted()).toEqual([]);
    expect(await backfill().refresh(orderId, true)).toMatchObject({
      outcome: { kind: "already" },
    });
  });

  it("une commande révisée sans remise : ses remises archivées, rien de repris", async () => {
    const orderId = await proOrder();
    await runPass(true);
    await drift(orderId, 0);

    expect(await backfill().refresh(orderId, true)).toMatchObject({
      outcome: { kind: "archived" },
    });
    expect(await discountsOf(orderId)).toEqual([]);
    expect(await backfill().drifted()).toEqual([]);
  });
});

describe("les contraintes", () => {
  it("un second rang 1 actif est refusé ; archivé, il est admis", async () => {
    const orderId = await proOrder();
    await runPass(true);
    const row = {
      orderId,
      origin: "frozen",
      rank: 1,
      baseCents: 0,
      amountCents: 0,
      vatShares: [],
    };

    await expect(
      ctx.prisma.orderDiscount.create({ data: { id: randomUUID(), ...row } }),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.orderDiscount.create({
        data: { id: randomUUID(), ...row, archivedAt: new Date(0) },
      }),
    ).resolves.toBeDefined();
  });

  it("une origine inconnue et des parts qui ne sont pas un tableau sont refusées", async () => {
    const orderId = await proOrder();
    const row = { orderId, rank: 1, baseCents: 0, amountCents: 0 };

    await expect(
      ctx.prisma.orderDiscount.create({
        data: { id: randomUUID(), ...row, origin: "guessed", vatShares: [] },
      }),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.orderDiscount.create({
        data: { id: randomUUID(), ...row, origin: "computed", vatShares: {} },
      }),
    ).rejects.toThrow();
  });

  /**
   * La révision supprime et recrée les lignes de la commande : une couverture
   * en RESTRICT l'aurait refusée sur toute commande reprise entre M2 et M3.
   * Depuis M3, elle archive la remise reprise et en écrit une neuve, couverte.
   */
  it("une commande reprise se révise encore : ses couvertures suivent ses lignes", async () => {
    const orderId = await proOrder();
    await runPass(true);
    const [recovered] = await discountsOf(orderId);

    await ctx
      .asSub(BUYER)
      .post(`/orders/${orderId}/revisions`)
      .send({ expectedRevision: 0, ...content({ quantity: 20 }) })
      .expect(200);

    const [fresh] = await discountsOf(orderId);
    expect(fresh?.id).not.toBe(recovered?.id);
    expect(fresh?.origin).toBe("computed");
    const lines = await ctx.prisma.orderLine.findMany({ where: { orderId }, select: { id: true } });
    expect(fresh?.coveredLines.map((covered) => covered.orderLineId)).toEqual(
      lines.map((line) => line.id),
    );
  });
});
