/**
 * E2E de la **modification d'une commande** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, lot M1).
 *
 * Ce que seul le vrai SQL prouve : l'écriture conditionnée sur la révision
 * (R7), les lignes remplacées avec l'historique complet de la composition
 * précédente, les déclencheurs de journée sur l'ancien et le nouveau jour, la
 * ligne d'encaissement recalée, le guichet du fournil sous le verrou de la
 * journée — et la course avec la clôture, qui doit inscrire la NOUVELLE
 * composition.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et Stripe.
 */
import {
  PERSONAL_WORKSPACE,
  WORKSPACE_HEADER,
  type AdminPlacedOrderResponse,
  type OrderRevisedResponse,
} from "@lfd/contracts";
import { randomUUID } from "node:crypto";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { poseSiteDiscount } from "./promotion-fixtures.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { untilWaiters } from "./day-lock-race.js";

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

/** La clé du verrou de la journée — celle de `PrismaProductionDayLock`. */
const DAY_LOCK_KEY = `production_day:${DAY}`;
/** Assez pour mettre deux requêtes en file sur une machine lente. */
const HOLD_TIMEOUT_MS = 20_000;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);
const buyer = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(BUYER);

interface Scene {
  readonly orderId: string;
  readonly companyId: string;
  readonly pickupId: string;
  /** L'adresse du carnet, livrée « avant 10:00 » — l'échéance inscrite (E1, É12). */
  readonly addressId: string;
}

/**
 * Un point de retrait à 10 % de remise pour les pros, une zone à 5 € pour
 * 73150, une société au compte, son acheteur — et sa commande de 10
 * croissants, saisie par l'équipe au compte.
 */
async function scene(options: { readonly discounted?: boolean } = {}): Promise<Scene> {
  const discounted = options.discounted ?? true;
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  // La remise des pros, posée en promotion de retrait à ce point depuis L12
  // (c'était la colonne de remise sur la fiche du site).
  if (discounted) {
    await poseSiteDiscount(staff(), point.id, { b2b: { mode: "percent", value: 1_000 } });
  }
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
  const address = await bookAddress(company.id);
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
  return { orderId: placed.id, companyId: company.id, pickupId: point.id, addressId: address };
}

/**
 * L'adresse du carnet de la société, livrée « avant 10:00 ». Depuis É12
 * (Hugo, 2026-11-03), l'équipe qui révise une commande pro ne demande, comme
 * le pro, qu'une échéance inscrite sur l'adresse (règle E1).
 */
async function bookAddress(companyId: string): Promise<string> {
  const address = await ctx.prisma.address.create({
    data: {
      label: "",
      ligne1: "2 rue Neuve",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      companyId,
      kind: "delivery",
      isDefault: true,
      deliverySpecs: {
        note: "",
        slotList: { mode: "everyday", slots: [] },
        deliveryContact: null,
        gps: null,
        signatureRequired: null,
        windowMode: "deadline",
        deadlines: { mode: "everyday", times: ["10:00"] },
      },
    },
    select: { id: true },
  });
  return address.id;
}

/** La commande voulue : un retrait au Labo, `DAY`, 10 croissants par défaut. */
function content(pickupId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001-1", quantity: 10 }],
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
          ...content(pickupId, { lines: [{ sku: "VIE-001-1", quantity: 20 }] }),
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
      { sku: "VIE-001-1", quantity: 20, unitPriceMillicents: 200_000 },
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
    // La trace de prix est retirée avec : elle expliquait l'ancien tarif. Sa
    // quantité ne change pas — changer, ce serait changer son prix, refusé
    // depuis le plan des remises acquises (`order-revision-locked-price`).
    await ctx.prisma.orderLine.updateMany({
      where: { orderId, sku: "VIE-001-1" },
      data: { unitPriceMillicents: 180_000, basePriceMillicents: null },
    });

    await staff()
      .post(`/admin/orders/${orderId}/revisions`)
      .send({
        expectedRevision: 0,
        ...content(pickupId, {
          lines: [
            { sku: "VIE-001-1", quantity: 10 },
            { sku: "VIE-002-1", quantity: 1 },
          ],
        }),
      })
      .expect(200);

    expect(await lineQuantities(orderId)).toEqual([
      { sku: "VIE-001-1", quantity: 10, unitPriceMillicents: 180_000 },
      { sku: "VIE-002-1", quantity: 1, unitPriceMillicents: 220_000 },
    ]);
  });

  /**
   * Changement de comportement (L9, plan des promotions § 13.8) : avec la
   * remise du point, ce passage la retirait en silence ; il est refusé
   * désormais. La commande d'ici n'a pas de remise, et c'est le seul cas où
   * le passage reste permis.
   */
  it("retrait → livraison un autre jour : frais de zone, les deux jours marqués", async () => {
    const { orderId, pickupId, addressId } = await scene({ discounted: false });
    const before = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(before.discountCents).toBe(0);
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
          deliveryAddressId: addressId,
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
  it("L9 : refuse retrait → livraison quand la commande perdrait la remise de son point", async () => {
    const { orderId, pickupId, addressId } = await scene();

    const refused = await staff()
      .post(`/admin/orders/${orderId}/revisions`)
      .send({
        expectedRevision: 0,
        ...content(pickupId, {
          fulfillmentMethod: "delivery",
          pickupAddressId: null,
          requestedWindow: { start: null, end: "10:00" },
          deliveryAddressId: addressId,
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
      .expect(409);

    expect(JSON.stringify(refused.body)).toContain("retirerait la promotion");
    const after = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(after).toMatchObject({ revision: 0, fulfillmentMethod: "pickup" });
  });

  it("refuse une commande réglée par carte, avec le geste de sortie", async () => {
    const { pickupId } = await scene();
    const placed = jsonBody<{ id: string }>(
      await buyer()
        .post("/orders")
        .set(WORKSPACE_HEADER, PERSONAL_WORKSPACE)
        .send({
          idempotencyKey: randomUUID(),
          salesTerms: null,
          settlement: "card",
          ...content(pickupId),
        })
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

  // A2 (2026-10-25) : après l'arrêt, l'équipe ne change plus que les quantités ;
  // le client reste refusé. Le cas « l'équipe change une quantité » est dans
  // order-revise-after-plan.e2e-spec.ts.
  it("R1 : inscrite au fournil, le client est refusé ; l'équipe, hors quantités, aussi", async () => {
    const { orderId, pickupId } = await scene();
    await staff().post(`/admin/production/batch/${DAY}/close`).expect(201);
    await ctx.drain();

    const client = await buyer()
      .post(`/orders/${orderId}/revisions`)
      .send({ expectedRevision: 0, ...content(pickupId, { note: "Client" }) })
      .expect(409);
    expect(JSON.stringify(client.body)).toContain("Le fournil a déjà inscrit cette commande");

    const refused = await staff()
      .post(`/admin/orders/${orderId}/revisions`)
      .send({ expectedRevision: 0, ...content(pickupId, { note: "Trop tard" }) })
      .expect(409);
    expect(JSON.stringify(refused.body)).toContain("seules les quantités");
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

/** Tient le verrou de la journée dans une troisième transaction, jusqu'à `release()`. */
async function holdDayLock(): Promise<{ readonly release: () => Promise<void> }> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held: () => void = () => undefined;
  const lockHeld = new Promise<void>((resolve) => {
    held = resolve;
  });
  const holder = ctx.prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${DAY_LOCK_KEY}, 0))`;
      held();
      await released;
    },
    { timeout: HOLD_TIMEOUT_MS },
  );
  await lockHeld;
  return {
    release: async () => {
      release();
      await holder;
    },
  };
}

describe("§9.1 — la course avec la clôture", () => {
  /**
   * Régression (2026-11-02, commit 52561f210) : la clôture lisait les commandes
   * AVANT le verrou de la journée, et une révision validée entre les deux était
   * inscrite dans son ancienne composition. Désormais la clôture lit sous son
   * verrou, que la révision prend aussi : la révision mise en file AVANT
   * l'arrêt valide la première (Postgres accorde un verrou consultatif dans
   * l'ordre d'attente), et l'arrêt doit inscrire la nouvelle composition —
   * ni perdue, ni un 500.
   */
  it("une révision en file avant l'arrêt est inscrite à jour", async () => {
    const { orderId, pickupId } = await scene();
    const lock = await holdDayLock();

    const revision = buyer()
      .post(`/orders/${orderId}/revisions`)
      .send({
        expectedRevision: 0,
        ...content(pickupId, { lines: [{ sku: "VIE-001-1", quantity: 33 }] }),
      })
      .then((response) => response);
    await untilWaiters(ctx, 1);
    const closing = staff()
      .post(`/admin/production/batch/${DAY}/close`)
      .then((response) => response);
    await untilWaiters(ctx, 2);
    await lock.release();

    expect((await revision).status).toBe(200);
    expect((await closing).status).toBe(201);

    const inscribed = await ctx.prisma.productionOrderLine.findMany({
      where: { order: { orderId } },
      select: { sku: true, quantity: true },
    });
    expect(inscribed).toEqual([{ sku: "VIE-001-1", quantity: 33 }]);
  });
});

describe("le devis de révision", () => {
  it("rend la révision à porter et l'écart, sans rien écrire", async () => {
    const { orderId, pickupId } = await scene();

    const quote = jsonBody<{ revision: number; differenceCents: number }>(
      await buyer()
        .post(`/orders/${orderId}/revisions/quote`)
        .send(content(pickupId, { lines: [{ sku: "VIE-001-1", quantity: 20 }] }))
        .expect(200),
    );

    expect(quote.revision).toBe(0);
    expect(quote.differenceCents).toBeGreaterThan(0);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).revision).toBe(0);
  });
});
