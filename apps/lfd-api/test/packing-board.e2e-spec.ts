/**
 * E2E du **poste servi par le colisage** — plan
 * `documentation/colisage/plan-domaine-colisage.md`, §17, K3a.
 *
 * Ce qui ne se voit qu'ici : `GET admin/packing/:date/board` rend, sur une
 * vraie journée, les piles et le « pas encore sorti du four » que la fiche
 * d'atelier débloque ; une commande colisée avec l'ancien poste (`counted`)
 * est en lecture seule (K3c, §17.6) ; fermer au colisage rend la commande
 * prête au commerce ; rouvrir ne touche qu'au rangement (la commande reste prête, et la
 * refermer n'écrit pas de fait neuf) ; rouvrir est refusé sur un bac chargé ;
 * et l'état du jour comme le contrôle qualité lisent « colisée ? » au colisage.
 */
import { randomUUID } from "node:crypto";

import type {
  OpenedPackingContainer,
  PackingSheet as PackingSheetView,
  ProductionDayStatus,
  ProductionPackingView,
} from "@lfd/contracts";

import { settleCardPayments } from "./card-payments.js";
import { binTypeId, loadBin } from "./delivery-loading-scene.js";
import { addVehicle, assign, openRound } from "./delivery-rounds-scene.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  markLine,
  place,
  recordBatch,
  relayGate,
  releaseRelay,
} from "./production-day-fixture.js";

const SITE = {
  label: "Maison",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Des ULID de forme valide, tirés « par l'écran ». */
const BATCH = "01K6A0000000000000000000K3";
const CHECK = "01K6A0000000000000000000Q1";
const PACKED = "packing.order_packed";

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  relayGate.open = true;
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

function staff() {
  return ctx.asSub(STAFF);
}

/** Une commande en livraison, payée, pour la journée servie. */
async function placeDelivery(quantity: number): Promise<void> {
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
  });
  await ctx
    .asSub(MEMBER)
    .post(`/orders`)
    .send({
      idempotencyKey: randomUUID(),
      companyId: null,
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "delivery",
      requestedWindow: { start: null, end: "10:00" },
      deliveryAddress: SITE,
      note: "",
      lines: [{ sku: CROISSANT, quantity }],
    })
    .expect(201);
  await settleCardPayments(ctx, issued);
}

/** La journée : une livraison de 20, un retrait de 4, arrêtée, et 24 pièces sorties du four. */
async function day(): Promise<{
  readonly delivery: PackingSheetView;
  readonly pickup: PackingSheetView;
}> {
  await placeDelivery(20);
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
  await closePlan(ctx);
  await settle();
  expect(await recordBatch(ctx, BATCH, 24)).toBe(204);
  await settle();
  const view = await board();
  const delivery = view.sheets.find((sheet) => sheet.fulfillmentMethod === "delivery");
  const pickup = view.sheets.find((sheet) => sheet.fulfillmentMethod === "pickup");
  if (delivery === undefined || pickup === undefined) {
    throw new Error("La journée devait porter une livraison et un retrait.");
  }
  return { delivery, pickup };
}

async function board(): Promise<ProductionPackingView> {
  return jsonBody<ProductionPackingView>(
    await staff().get(`/admin/packing/${SERVICE_DAY}/board`).expect(200),
  );
}

function base(orderId: string): string {
  return `/admin/packing/${SERVICE_DAY}/orders/${orderId}`;
}

/** Un sac au retrait, rempli de ses 4 pièces : la commande devient fermable. */
async function fillPickup(orderId: string): Promise<void> {
  const bag = jsonBody<OpenedPackingContainer>(
    await staff()
      .post(`${base(orderId)}/containers`)
      .send({ nature: "bag" })
      .expect(201),
  );
  await staff()
    .post(`${base(orderId)}/containers/${bag.containerId}/lines/${CROISSANT}`)
    .send({ quantity: 4 })
    .expect(204);
}

/** Un bac à la livraison, rempli de ses 20 pièces ; rend son identifiant de bac. */
async function fillDelivery(orderId: string): Promise<string> {
  const opened = jsonBody<OpenedPackingContainer>(
    await staff()
      .post(`${base(orderId)}/containers`)
      .send({ nature: "bin", binTypeId: await binTypeId(ctx), half: false, innerBags: 0 })
      .expect(201),
  );
  await staff()
    .post(`${base(orderId)}/containers/${opened.containerId}/lines/${CROISSANT}`)
    .send({ quantity: 20 })
    .expect(204);
  const sheet = (await board()).sheets.find((candidate) => candidate.orderId === orderId);
  return sheet?.containerList?.[0]?.binId ?? "";
}

async function statusOf(orderId: string): Promise<string> {
  return (
    await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } })
  ).status;
}

async function packedFacts(): Promise<number> {
  return ctx.prisma.outboxMessage.count({ where: { type: PACKED } });
}

describe("GET admin/packing/:date/board — le poste lu au colisage", () => {
  it("compte les piles d'une vraie journée : une prête, une à faire", async () => {
    const { delivery, pickup } = await day();
    // Des lignes réparties, un contenant, un bac fermé : tout ce que l'écran lit.
    await fillDelivery(delivery.orderId);
    await fillPickup(pickup.orderId);
    await staff()
      .post(`${base(pickup.orderId)}/close`)
      .expect(204);
    await settle();

    const served = await board();

    expect(served).toMatchObject({ orderCount: 2, readyCount: 1, todoCount: 1 });
    expect(served.sheets.find((s) => s.orderId === delivery.orderId)).toMatchObject({
      containers: 1,
      packedPieces: 20,
      canDeclareReady: true,
    });
  });

  it("🔴 refuse un article pas encore sorti du four, et l'accepte quand la FICHE est cochée", async () => {
    // Les deux postes se parlent par la remise : c'est une coche de la fiche
    // d'atelier qui débloque le sac. Rien d'autre que la base ne le prouve.
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);
    await settle();
    const [sheet] = (await board()).sheets;
    if (sheet === undefined) {
      throw new Error("La journée devait porter un bac.");
    }
    expect(sheet.lines[0]?.awaitingProduction).toBe(true);
    const bag = jsonBody<OpenedPackingContainer>(
      await staff()
        .post(`${base(sheet.orderId)}/containers`)
        .send({ nature: "bag" })
        .expect(201),
    );
    const into = () =>
      staff()
        .post(`${base(sheet.orderId)}/containers/${bag.containerId}/lines/${CROISSANT}`)
        .send({ quantity: 12 });
    expect((await into()).status).toBe(409);

    expect(await markLine(ctx)).toBe(204);
    await settle();

    expect((await board()).sheets[0]?.lines[0]?.awaitingProduction).toBe(false);
    await into().expect(204);
  });

  it("une journée jamais arrêtée se lit « plan non arrêté »", async () => {
    expect(await board()).toMatchObject({ closedAt: null, sheets: [], resources: [] });
  });

  it("refuse une date hors forme", async () => {
    await staff().get(`/admin/packing/demain/board`).expect(400);
  });
});

describe("une commande colisée avec l'ancien poste (`counted`, K3c, §17.6)", () => {
  /**
   * Une commande inscrite AVANT la colonne Contenants — un état que ce binaire
   * ne produit plus, reconstitué en base : c'est le sujet du test.
   */
  async function asCounted(orderId: string): Promise<void> {
    await ctx.prisma.packingOrder.updateMany({
      where: { serviceDay: SERVICE_DAY, orderId },
      data: { containerMode: "counted" },
    });
  }

  it("🔴 se lit, mais ne se ferme plus : « Déclarer prête » est désarmé et refusé", async () => {
    const { pickup } = await day();
    await asCounted(pickup.orderId);

    const sheet = (await board()).sheets.find((s) => s.orderId === pickup.orderId);
    expect(sheet).toMatchObject({ containerMode: "counted", canDeclareReady: false });

    const refused = await staff().post(`${base(pickup.orderId)}/close`);
    expect(refused.status).toBe(409);
    expect(JSON.stringify(refused.body)).toContain("colisée avec l'ancien poste");
    expect(await packedFacts()).toBe(0);
  });

  it("ne reçoit plus de contenant", async () => {
    const { pickup } = await day();
    await asCounted(pickup.orderId);

    await staff()
      .post(`${base(pickup.orderId)}/containers`)
      .send({ nature: "bag" })
      .expect(409);
  });
});

describe("fermer et rouvrir au colisage", () => {
  it("fermer rend la commande prête au commerce", async () => {
    const { pickup } = await day();
    await fillPickup(pickup.orderId);

    await staff()
      .post(`${base(pickup.orderId)}/close`)
      .expect(204);
    await settle();

    expect(await statusOf(pickup.orderId)).toBe("ready");
    const sheet = (await board()).sheets.find((s) => s.orderId === pickup.orderId);
    expect(sheet?.canDeclareReady).toBe(false);
    expect(sheet?.packedAt).not.toBeNull();
    expect(sheet?.packedBy).not.toBeNull();
  });

  it("rouvrir rend le rangement, garde la commande prête ; refermer n'écrit aucun fait neuf", async () => {
    const { pickup } = await day();
    await fillPickup(pickup.orderId);
    await staff()
      .post(`${base(pickup.orderId)}/close`)
      .expect(204);
    await settle();

    await staff()
      .post(`${base(pickup.orderId)}/reopen`)
      .expect(204);
    await settle();

    const reopened = (await board()).sheets.find((s) => s.orderId === pickup.orderId);
    expect(reopened).toMatchObject({ packedAt: null, canDeclareReady: true, packedPieces: 4 });
    expect(await statusOf(pickup.orderId)).toBe("ready");

    await staff()
      .post(`${base(pickup.orderId)}/close`)
      .expect(204);
    await settle();
    expect(await packedFacts()).toBe(1);
  });

  it("🔴 rouvrir est refusé quand un bac est chargé, et la commande reste fermée", async () => {
    const { delivery } = await day();
    const roundId = await openRound(ctx, SERVICE_DAY, await addVehicle(ctx, "Kangoo"));
    await assign(ctx, SERVICE_DAY, roundId, delivery.orderId);
    const binId = await fillDelivery(delivery.orderId);
    await staff()
      .post(`${base(delivery.orderId)}/close`)
      .expect(204);
    await loadBin(ctx, roundId, { binId }).expect(204);

    const refused = await staff().post(`${base(delivery.orderId)}/reopen`);

    expect(refused.status).toBe(409);
    const sheet = (await board()).sheets.find((s) => s.orderId === delivery.orderId);
    expect(sheet?.packedAt).not.toBeNull();
  });
});

describe("le fournil lit « colisée ? » au colisage (PackedOrdersReader)", () => {
  it("l'état du jour voit un bac fermé au colisage avant que le commerce ne l'apprenne", async () => {
    const { pickup } = await day();
    await fillPickup(pickup.orderId);
    relayGate.open = false;

    await staff()
      .post(`${base(pickup.orderId)}/close`)
      .expect(204);

    const behind = jsonBody<ProductionDayStatus>(
      await staff().get(`/admin/production/batch/${SERVICE_DAY}/status`).expect(200),
    );
    expect(behind.packedBehind).toBe(1);
    await releaseRelay(ctx);
    await settle();
    const caughtUp = jsonBody<ProductionDayStatus>(
      await staff().get(`/admin/production/batch/${SERVICE_DAY}/status`).expect(200),
    );
    expect(caughtUp.packedBehind).toBe(0);
  });

  it("le contrôle qualité accepte une commande fermée au colisage, et la refuse rouverte", async () => {
    const { pickup } = await day();
    await fillPickup(pickup.orderId);
    await staff()
      .post(`${base(pickup.orderId)}/close`)
      .expect(204);
    await settle();
    const check = (id: string) =>
      staff()
        .post(`/admin/supervision/quality/checks`)
        .send({
          id,
          serviceDay: SERVICE_DAY,
          target: { kind: "order", orderId: pickup.orderId },
          verdict: "ok",
          note: null,
          uploadIds: [],
        });

    await check(CHECK).expect(201);

    await staff()
      .post(`${base(pickup.orderId)}/reopen`)
      .expect(204);
    const refused = await check("01K6A0000000000000000000Q2");
    expect(refused.status).toBe(409);
  });
});
