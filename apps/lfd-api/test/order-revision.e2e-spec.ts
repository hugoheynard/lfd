/**
 * E2E de la **modification d'une commande** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, lot M1).
 *
 * Ce que seul le vrai SQL prouve : l'écriture conditionnée sur la révision
 * (R7), les lignes remplacées avec l'historique complet de la composition
 * précédente, les déclencheurs de journée sur l'ancien et le nouveau jour, la
 * ligne d'encaissement recalée, le guichet du fournil sous le verrou de la
 * journée — et la course avec la clôture, qui doit inscrire la NOUVELLE
 * composition.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et Stripe. Une
 * ENVELOPPE autour du vrai lecteur des commandes du jour glisse une
 * modification entre la lecture de la clôture et son verrou.
 */
import {
  PERSONAL_WORKSPACE,
  WORKSPACE_HEADER,
  type AdminPlacedOrderResponse,
  type OrderRevisedResponse,
} from "@lfd/contracts";
import { randomUUID } from "node:crypto";

import { SitedDayOrders } from "../src/b2b/orders/application/services/sited-day-orders.service.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
  type ServiceDay,
} from "../src/production/channels/commerce/index.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const DAY = serviceDay(7);
const NEXT_DAY = serviceDay(8);
const BUYER = "auth0|acheteur-revision";
const OUTSIDER = "auth0|etranger-revision";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_revision_${String(intentCounter)}`,
      clientSecret: `pi_revision_${String(intentCounter)}_secret`,
    });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment",
    }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

/** Joué une fois, juste après la lecture des commandes du jour par la clôture. */
let afterDayRead: (() => Promise<void>) | null = null;

/** Le vrai lecteur, encadré du crochet : la clôture lit, PUIS une révision passe. */
const hookedDayOrders = {
  producibleFor: async (day: ServiceDay): Promise<readonly ProducibleOrder[]> => {
    const read = await ctx.app.get(SitedDayOrders, { strict: false }).producibleFor(day);
    const hook = afterDayRead;
    afterDayRead = null;
    if (hook !== null) {
      await hook();
    }
    return read;
  },
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
      { token: DayOrdersReader, value: hookedDayOrders },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  afterDayRead = null;
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);
const buyer = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(BUYER);

interface Scene {
  readonly orderId: string;
  readonly companyId: string;
  readonly pickupId: string;
}

/**
 * Un point de retrait à 10 % de remise pour les pros, une zone à 5 € pour
 * 73150, une société au compte, son acheteur — et sa commande de 10
 * croissants, saisie par l'équipe au compte.
 */
async function scene(): Promise<Scene> {
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
      discountMode: "percent",
      discountValue: 1_000,
    },
    select: { id: true },
  });
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 500 },
  });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER, email: "acheteur@test.fr" });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  const placed = jsonBody<AdminPlacedOrderResponse>(
    await staff()
      .post("/admin/orders")
      .send({
        companyId: company.id,
        buyerUserId: user.id,
        settlement: "account",
        ...content(point.id),
      })
      .expect(201),
  );
  return { orderId: placed.id, companyId: company.id, pickupId: point.id };
}

/** La commande voulue : un retrait au Labo, `DAY`, 10 croissants par défaut. */
function content(pickupId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001", quantity: 10 }],
    ...over,
  };
}

function lineQuantities(orderId: string) {
  return ctx.prisma.orderLine.findMany({
    where: { orderId },
    select: { sku: true, quantity: true, unitPriceMillicents: true },
    orderBy: { sku: "asc" },
  });
}

describe("POST /orders/:id/revisions — le client modifie sa commande au compte", () => {
  it("remplace les lignes, monte la révision, garde la composition précédente en entier", async () => {
    const { orderId, pickupId } = await scene();
    const before = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    const revised = jsonBody<OrderRevisedResponse>(
      await buyer()
        .post(`/orders/${orderId}/revisions`)
        .send({
          expectedRevision: 0,
          ...content(pickupId, { lines: [{ sku: "VIE-001", quantity: 20 }] }),
        })
        .expect(200),
    );

    expect(revised).toMatchObject({
      id: orderId,
      revision: 1,
      previousTotalCents: before.totalCents,
    });
    const after = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(after.revision).toBe(1);
    expect(after.totalCents).toBe(revised.totalCents);
    expect(after.totalCents).toBeGreaterThan(before.totalCents);
    expect(await lineQuantities(orderId)).toEqual([
      { sku: "VIE-001", quantity: 20, unitPriceMillicents: 200_000 },
    ]);
    const history = await ctx.prisma.orderRevisionEntry.findMany({ where: { orderId } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      replacedRevision: 0,
      changes: ["lines"],
      totalBeforeCents: before.totalCents,
      revisedByKind: "customer",
    });
    expect(JSON.stringify(history[0]?.composition)).toContain('"quantity":10');
  });

  it("une ligne déjà présente garde son prix d'origine ; une ligne nouvelle prend le prix du jour", async () => {
    const { orderId, pickupId } = await scene();
    // Le croissant a été passé à 1,80 € : le catalogue dit 2,00 € aujourd'hui.
    // La trace de prix est retirée avec : elle expliquait l'ancien tarif.
    await ctx.prisma.orderLine.updateMany({
      where: { orderId, sku: "VIE-001" },
      data: { unitPriceMillicents: 180_000, basePriceMillicents: null },
    });

    await staff()
      .post(`/admin/orders/${orderId}/revisions`)
      .send({
        expectedRevision: 0,
        ...content(pickupId, {
          lines: [
            { sku: "VIE-001", quantity: 12 },
            { sku: "VIE-002", quantity: 1 },
          ],
        }),
      })
      .expect(200);

    expect(await lineQuantities(orderId)).toEqual([
      { sku: "VIE-001", quantity: 12, unitPriceMillicents: 180_000 },
      { sku: "VIE-002", quantity: 1, unitPriceMillicents: 220_000 },
    ]);
  });

  it("retrait → livraison un autre jour : frais de zone, plus de remise, les deux jours marqués", async () => {
    const { orderId, pickupId } = await scene();
    const before = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(before.discountCents).toBeGreaterThan(0);
    await ctx.prisma.orderCollection.create({
      data: {
        orderId,
        state: "due",
        amountCents: before.totalCents,
        updatedAt: new Date(daysAgo(0)),
      },
    });
    const traces = (day: string) => ctx.prisma.orderDayChange.count({ where: { serviceDay: day } });
    const [dayBefore, nextBefore] = [await traces(DAY), await traces(NEXT_DAY)];

    await staff()
      .post(`/admin/orders/${orderId}/revisions`)
      .send({
        expectedRevision: 0,
        ...content(pickupId, {
          requestedDeliveryDate: NEXT_DAY,
          fulfillmentMethod: "delivery",
          pickupAddressId: null,
          requestedWindow: { start: null, end: "10:00" },
          deliveryAddress: {
            label: "",
            ligne1: "2 rue Neuve",
            ligne2: "",
            codePostal: "73150",
            ville: "Val d'Isère",
            pays: "France",
          },
        }),
      })
      .expect(200);

    const after = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(after).toMatchObject({
      fulfillmentMethod: "delivery",
      discountCents: 0,
      deliveryFeeCents: 500,
      revision: 1,
    });
    expect(after.requestedDeliveryDate?.toISOString().slice(0, 10)).toBe(NEXT_DAY);
    // Les déclencheurs de `orders` marquent l'ancien ET le nouveau jour.
    expect(await traces(DAY)).toBeGreaterThan(dayBefore);
    expect(await traces(NEXT_DAY)).toBeGreaterThan(nextBefore);
    // La ligne d'encaissement ouverte suit le nouveau total.
    const collection = await ctx.prisma.orderCollection.findUniqueOrThrow({ where: { orderId } });
    expect(collection.amountCents).toBe(after.totalCents);
    // Le journal garde le témoin de la modification.
    await ctx.drain();
    const journal = await ctx.prisma.activityEvent.findMany({ where: { type: "order.revised" } });
    expect(journal).toHaveLength(1);
  });
});

describe("POST /orders/:id/revisions — les refus", () => {
  it("refuse une commande réglée par carte, avec le geste de sortie", async () => {
    const { pickupId } = await scene();
    const placed = jsonBody<{ id: string }>(
      await buyer()
        .post("/orders")
        .set(WORKSPACE_HEADER, PERSONAL_WORKSPACE)
        .send({ idempotencyKey: randomUUID(), settlement: "card", ...content(pickupId) })
        .expect(201),
    );

    const refused = await buyer()
      .post(`/orders/${placed.id}/revisions`)
      .send({ expectedRevision: 0, ...content(pickupId, { note: "x" }) })
      .expect(409);

    expect(JSON.stringify(refused.body)).toContain("Commande réglée par carte");
  });

  it("R7 : une seconde modification qui porte une révision dépassée est refusée (409)", async () => {
    const { orderId, pickupId } = await scene();
    await buyer()
      .post(`/orders/${orderId}/revisions`)
      .send({ expectedRevision: 0, ...content(pickupId, { note: "Une" }) })
      .expect(200);

    const refused = await buyer()
      .post(`/orders/${orderId}/revisions`)
      .send({ expectedRevision: 0, ...content(pickupId, { note: "Deux" }) })
      .expect(409);

    expect(JSON.stringify(refused.body)).toContain("modifiée ailleurs");
    expect(await ctx.prisma.orderRevisionEntry.count({ where: { orderId } })).toBe(1);
  });

  it("R1 : après l'heure limite, le client est refusé ; l'équipe passe", async () => {
    const { orderId, pickupId } = await scene();
    // La limite du jour de service est tombée l'avant-veille à minuit.
    await ctx.prisma.orderCutoff.create({
      data: { pickupAddressId: null, weekday: null, daysBefore: 8, time: "00:00", graceMinutes: 0 },
    });

    await buyer()
      .post(`/orders/${orderId}/revisions`)
      .send({ expectedRevision: 0, ...content(pickupId, { note: "Client" }) })
      .expect(409);
    await staff()
      .post(`/admin/orders/${orderId}/revisions`)
      .send({ expectedRevision: 0, ...content(pickupId, { note: "Équipe" }) })
      .expect(200);
  });

  it("R1 : une commande inscrite au fournil ne se modifie plus, même par l'équipe", async () => {
    const { orderId, pickupId } = await scene();
    await staff().post(`/admin/production/batch/${DAY}/close`).expect(201);
    await ctx.drain();

    const refused = await staff()
      .post(`/admin/orders/${orderId}/revisions`)
      .send({ expectedRevision: 0, ...content(pickupId, { note: "Trop tard" }) })
      .expect(409);

    expect(JSON.stringify(refused.body)).toContain("Le fournil a déjà inscrit cette commande");
  });

  it("le mur : un client d'une autre maison ne trouve pas la commande (404)", async () => {
    const { orderId, pickupId } = await scene();
    await createUser(ctx.prisma, { auth0Sub: OUTSIDER, email: "etranger@test.fr" });

    await ctx
      .asSub(OUTSIDER)
      .post(`/orders/${orderId}/revisions`)
      .send({ expectedRevision: 0, ...content(pickupId, { note: "x" }) })
      .expect(404);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).revision).toBe(0);
  });
});

describe("§9.1 — la course avec la clôture", () => {
  /**
   * La clôture lit les commandes AVANT le verrou de la journée. Une révision
   * validée entre les deux aurait été inscrite dans son ancienne composition :
   * le repère des notes a bougé, la clôture relit sous son verrou.
   */
  it("une révision passée entre la lecture de la clôture et son verrou est inscrite à jour", async () => {
    const { orderId, pickupId } = await scene();
    afterDayRead = async () => {
      await buyer()
        .post(`/orders/${orderId}/revisions`)
        .send({
          expectedRevision: 0,
          ...content(pickupId, { lines: [{ sku: "VIE-001", quantity: 33 }] }),
        })
        .expect(200);
    };

    await staff().post(`/admin/production/batch/${DAY}/close`).expect(201);

    const inscribed = await ctx.prisma.productionOrderLine.findMany({
      where: { order: { orderId } },
      select: { sku: true, quantity: true },
    });
    expect(inscribed).toEqual([{ sku: "VIE-001", quantity: 33 }]);
  });
});

describe("le devis de révision", () => {
  it("rend la révision à porter et l'écart, sans rien écrire", async () => {
    const { orderId, pickupId } = await scene();

    const quote = jsonBody<{ revision: number; differenceCents: number }>(
      await buyer()
        .post(`/orders/${orderId}/revisions/quote`)
        .send(content(pickupId, { lines: [{ sku: "VIE-001", quantity: 20 }] }))
        .expect(200),
    );

    expect(quote.revision).toBe(0);
    expect(quote.differenceCents).toBeGreaterThan(0);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).revision).toBe(0);
  });
});
