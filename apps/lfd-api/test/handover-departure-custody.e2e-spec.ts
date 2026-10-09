import { randomUUID } from "node:crypto";
/**
 * E2E : **la garde passe au livreur au départ**
 * (`documentation/livraisons/livreur/a-la-porte.md`, § 10 ter, BQ — LB-Q1 :
 * « on ne peut pas faire de contrôle qualité sur les commandes d'une tournée
 * partie, car nous ne sommes plus en présence du produit »).
 *
 * Ce que seule cette suite prouve : les deux canaux (`delivery/channels/
 * handover/`, `production/channels/handover/`) sont reliés par la racine de
 * composition, le départ lit la vraie retenue, la garde passe par la boîte
 * d'envoi (fait durable `delivery.round_departed`, DD1) — rien si le départ
 * est annulé —, et le fournil lit la vraie garde.
 */
import type request from "supertest";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { DeliveryOrdersBroughtBackFact } from "../src/delivery/channels/handover/index.js";
import { DurablePublisher } from "../src/platform/outbox/durable-publisher.js";
import { PrismaService } from "../src/platform/database/prisma.service.js";
import { currentTransaction } from "../src/platform/database/transaction.store.js";
import { PrismaUnitOfWork, UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { settleCardPayments } from "./card-payments.js";
import { ADMIN_VERIFIER_OVERRIDE, addVehicle, assign, openRound } from "./delivery-rounds-scene.js";
import { binTypeId, depart, loadBin } from "./delivery-loading-scene.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { coliseOrder } from "./production-day-fixture.js";

const MEMBER = "auth0|member-custody";
const DAY = serviceDay();
const CROISSANT = "VIE-001";
const DEPARTED = "La commande est partie : le produit n'est plus là.";

const SITE = {
  label: "Refuge",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const issuedIntents: string[] = [];
const fakeGateway = {
  createIntent: () => {
    const id = `pi_e2e_custody_${String(issuedIntents.length + 1)}`;
    issuedIntents.push(id);
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

/**
 * La vraie unité de travail, que le test fait échouer APRÈS le travail de
 * l'unité la plus externe — la mécanique de `delivery-en-route.e2e-spec.ts`.
 */
class FailableUnitOfWork extends UnitOfWork {
  inner: UnitOfWork | null = null;
  failNextCommit = false;

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.inner === null) {
      throw new RangeError("unité de travail e2e non branchée");
    }
    if (currentTransaction() !== undefined) {
      return this.inner.run(work);
    }
    return this.inner.run(async () => {
      const result = await work();
      if (this.failNextCommit) {
        this.failNextCommit = false;
        throw new RangeError("validation refusée (e2e)");
      }
      return result;
    });
  }
}
const unitOfWork = new FailableUnitOfWork();

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: PaymentGateway, value: fakeGateway },
      { token: UnitOfWork, value: unitOfWork },
    ],
  });
  unitOfWork.inner = new PrismaUnitOfWork(ctx.app.get(PrismaService));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  issuedIntents.splice(0);
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
  });
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

let sequence = 0;
function ulid(): string {
  sequence += 1;
  return `01JQG${String(sequence).padStart(21, "0")}`;
}

/** Passe et règle une commande de croissants pour le jour ; rend son id commerce. */
async function place(fulfillment: "pickup" | "delivery"): Promise<string> {
  const point = await ctx.prisma.pickupAddress.findFirst({ select: { id: true } });
  const pickupId =
    point?.id ?? (await ctx.prisma.pickupAddress.create({ data: { ...SITE, isDefault: true } })).id;
  const where =
    fulfillment === "pickup"
      ? { pickupAddressId: pickupId }
      : { deliveryAddress: SITE, requestedWindow: { start: null, end: "10:00" } };
  const placed = jsonBody<{ orderNumber: string }>(
    await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        idempotencyKey: randomUUID(),
        companyId: null,
        requestedDeliveryDate: DAY,
        fulfillmentMethod: fulfillment,
        ...where,
        note: "",
        lines: [{ sku: CROISSANT, quantity: 6 }],
      })
      .expect(201),
  );
  await settleCardPayments(ctx, issuedIntents);
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { orderNumber: placed.orderNumber },
    select: { id: true },
  });
  return row.id;
}

/**
 * La journée arrêtée, la fournée sortie, et chaque commande colisée AU
 * COLISAGE — un sac pour un retrait, un bac pour une livraison (K3c). Rend le
 * bac de chaque livraison.
 */
async function closeAndPack(orderIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
  await staff().post(`/admin/production/batch/${DAY}/close`).expect(201);
  await staff()
    .put(`/admin/production/worksheet/${DAY}/lines/${CROISSANT}/done`)
    .send({ initials: "KA" })
    .expect(204);
  // Depuis K2, la journée naît au colisage : la liste à coliser et la remise
  // lui arrivent par la boîte d'envoi, hors de la requête.
  await ctx.drain();
  const bins = new Map<string, string>();
  for (const orderId of orderIds) {
    const { fulfillmentMethod } = await ctx.prisma.productionOrder.findFirstOrThrow({
      where: { serviceDay: DAY, orderId },
      select: { fulfillmentMethod: true },
    });
    const binId = await coliseOrder(ctx, {
      staff: E2E_STAFF_SUB,
      day: DAY,
      orderId,
      container:
        fulfillmentMethod === "delivery"
          ? { nature: "bin", binTypeId: await binTypeId(ctx), half: false, innerBags: 0 }
          : { nature: "bag" },
    });
    if (binId !== null) {
      bins.set(orderId, binId);
    }
  }
  await ctx.drain();
  return bins;
}

/** Une livraison colisée, composée dans une tournée, son bac chargé. */
async function loadedDelivery(): Promise<{ readonly orderId: string; readonly roundId: string }> {
  const orderId = await place("delivery");
  const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
  await assign(ctx, DAY, roundId, orderId);
  const binId = (await closeAndPack([orderId])).get(orderId);
  if (binId === undefined) {
    throw new Error("La livraison colisée devait porter son bac.");
  }
  await loadBin(ctx, roundId, { binId }).expect(204);
  return { orderId, roundId };
}

function judge(orderId: string, verdict: "ok" | "blocking") {
  return staff()
    .post(`/admin/supervision/quality/checks`)
    .send({
      id: ulid(),
      serviceDay: DAY,
      target: { kind: "order", orderId },
      verdict,
      note: verdict === "ok" ? null : "Bac écrasé",
      uploadIds: [],
    });
}

function messageOf(response: request.Response): string {
  return jsonBody<{ message: string }>(response).message;
}

describe("la garde passe au livreur au départ (BQ)", () => {
  it("avant le départ, le verdict est permis", async () => {
    const { orderId } = await loadedDelivery();

    await judge(orderId, "ok").expect(201);
  });

  it("une commande retenue : le départ est refusé en nommant l'arrêt ; la retenue levée, il part", async () => {
    const { orderId, roundId } = await loadedDelivery();
    await judge(orderId, "blocking").expect(201);

    const refused = await depart(ctx, roundId);
    expect(refused.status).toBe(409);
    expect(messageOf(refused)).toMatch(/l'arrêt .+ est retenu au contrôle qualité/u);
    await ctx.drain();
    expect(await ctx.prisma.orderDeparture.count()).toBe(0);

    await judge(orderId, "ok").expect(201);
    expect((await depart(ctx, roundId)).status).toBe(204);
  });

  it("après le départ, un verdict sur la commande est refusé : le produit n'est plus là", async () => {
    const { orderId, roundId } = await loadedDelivery();

    expect((await depart(ctx, roundId)).status).toBe(204);
    await ctx.drain();

    const refused = await judge(orderId, "blocking").expect(409);
    expect(messageOf(refused)).toMatch(new RegExp(`^${DEPARTED}`, "u"));
  });

  it("🔴 B3 : une commande RAPPORTÉE est revenue — le verdict est de nouveau permis", async () => {
    const { orderId, roundId } = await loadedDelivery();
    expect((await depart(ctx, roundId)).status).toBe(204);
    await ctx.drain();

    // Le fait durable que « Rapporter » écrit dans sa transaction (DD1).
    const fact = new DeliveryOrdersBroughtBackFact(roundId, [orderId], new Date(daysAgo(0)));
    await unitOfWork.run(() => ctx.app.get(DurablePublisher).publish(fact.durableFact()));
    await ctx.drain();

    await judge(orderId, "ok").expect(201);
  });

  it("un départ dont la transaction échoue n'annonce rien : le verdict reste permis", async () => {
    const { orderId, roundId } = await loadedDelivery();
    // Le relais peut livrer un fait durable par une unité de travail externe —
    // celle que `failNextCommit` fait échouer : on le draine d'abord (course vue
    // le 2026-10-07 sur la remise à la porte, après B1).
    await ctx.drain();
    unitOfWork.failNextCommit = true;

    expect((await depart(ctx, roundId)).status).toBe(500);
    await ctx.drain();

    expect(await ctx.prisma.orderDeparture.count()).toBe(0);
    await judge(orderId, "ok").expect(201);
  });

  it("une commande déjà retirée au comptoir : le verdict est refusé en le disant", async () => {
    const orderId = await place("pickup");
    await closeAndPack([orderId]);
    const { handoverToken } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { handoverToken: true },
    });
    await staff()
      .post(`/admin/handover/${handoverToken ?? ""}`)
      .expect(201);

    const refused = await judge(orderId, "ok").expect(409);
    expect(messageOf(refused)).toMatch(/est déjà retirée : le produit n'est plus là/u);
  });
});
