/**
 * E2E du **parcours du Labo**, d'un seul tenant : le réassort « pour demain »
 * d'un point SERVI SUR PLACE, de l'envoi au comptoir jusqu'au stock du jour
 * lu par la Supervision — le pendant de `resupply-village-flow.e2e-spec.ts`
 * (R3a–R3e, S1 de `documentation/reassort-boutiques/plan-reapprovisionnement.md`).
 *
 * Ce qui ne s'éprouve qu'ici : que les maillons S'ENCHAÎNENT sans transfert
 * ni colisage du réassort — la part du Labo monte de la feuille à la vitrine
 * par « Monté », et la réception se pré-remplit au demandé.
 *
 * L'horloge est figée et SAUTE : la veille (J-1) puis le jour servi (J, dans
 * une semaine). Aucune date du calendrier.
 *
 * Écritures Prisma assumées, les mêmes que la suite du Village : le point
 * (`site.create`, pas de route de création dans le harnais du fournil) et la
 * fiche staff porteuse d'un rôle (`staffUser.create`, comme `resupply-arrived`).
 */
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import type {
  DayStockOverviewView,
  PackingResuppliesView,
  ProductionDayResuppliesView,
  ResupplyReceiptView,
} from "@lfd/contracts";
import { addDays, localToInstant } from "@lfd/contracts";
import type request from "supertest";

import { pdfPages } from "../src/platform/pdf/__tests__/pdf-text.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { settleCardPayments } from "./card-payments.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapProductionDay,
  CROISSANT,
  MEMBER,
  recordBatch,
  SERVICE_DAY,
  STAFF,
  worksheetLine,
} from "./production-day-fixture.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const EVE = addDays(SERVICE_DAY, -1);
const NAME = "Vitrine du matin";
const ASKED = 20;
const ORDERED = 4;
const BATCH = "01K6A0000000000000000000AB";
const clock = new FixedClock(new Date());
let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay([
    { token: Clock, value: clock },
    // Le jeton porteur EST le `sub` : le fournil est une autre fiche que le staff.
    ADMIN_VERIFIER_OVERRIDE,
  ]));
});

afterAll(async () => {
  await ctx.close();
});

/** L'instant de la maison `time` le jour `day`, à l'heure de Paris. */
function at(day: string, time: string): Date {
  const instant = localToInstant(day, time);
  if (instant === null) {
    throw new TypeError(`heure locale inexistante : ${day} ${time}`);
  }
  return instant;
}

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

const staff = () => ctx.asSub(STAFF);

interface Flow {
  readonly labo: string;
  readonly resupplyId: string;
}

/** Le Labo : servi sur place (`supply` par défaut), ouvert au retrait du matin. */
async function seedLabo(): Promise<string> {
  const labo = await ctx.prisma.site.create({
    data: {
      label: "Le Labo",
      ligne1: "1 place",
      codePostal: "73150",
      ville: "Val",
      pays: "France",
      supply: "on_site",
      opening: { publicOpening: null, proPickup: { start: "07:30", end: "09:00" } },
    },
    select: { id: true },
  });
  return labo.id;
}

async function twoHours(): Promise<void> {
  await staff()
    .put("/admin/order-cutoffs/general")
    .send({ daysBefore: 1, time: "18:00", graceMinutes: 0 })
    .expect(204);
  await staff()
    .patch("/admin/order-cutoff-settings")
    .send({ resupplyCutoffTime: "20:00" })
    .expect(204);
}

async function counterSendsNamed(labo: string): Promise<string> {
  const base = `/admin/site-resupplies/sites/${labo}`;
  await staff().put(`${base}/drafts/tomorrow/name`).send({ name: NAME }).expect(200);
  const added = await staff()
    .post(`${base}/drafts/tomorrow/lines`)
    .send({ sku: CROISSANT, quantity: ASKED })
    .expect(201);
  const id = jsonBody<{ id: string }>(added).id;
  const view = jsonBody<{ drafts: readonly { id: string; version: number }[] }>(
    await staff().get(base).expect(200),
  );
  const version = view.drafts.find((draft) => draft.id === id)?.version;
  await staff().post(`${base}/${id}/send`).send({ version }).expect(204);
  return id;
}

async function customerOrdersAtLabo(labo: string): Promise<void> {
  await ctx
    .asSub(MEMBER)
    .post("/orders")
    .send({
      idempotencyKey: randomUUID(),
      companyId: null,
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "pickup",
      requestedWindow: { start: "07:30", end: "09:00" },
      pickupAddressId: labo,
      note: "",
      lines: [{ sku: CROISSANT, quantity: ORDERED }],
    })
    .expect(201);
  await settleCardPayments(ctx, issued);
}

async function stepEveAfternoon(): Promise<Flow> {
  clock.set(at(EVE, "15:00"));
  const labo = await seedLabo();
  await twoHours();
  const resupplyId = await counterSendsNamed(labo);
  await customerOrdersAtLabo(labo);
  return { labo, resupplyId };
}

async function autoCloseTour(): Promise<string> {
  const response = await ctx
    .http()
    .post("/admin/production/auto-close")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
  return jsonBody<{ outcome: string }>(response).outcome;
}

async function dossierPages(): Promise<readonly string[]> {
  const pdf = await staff()
    .get(`/admin/production/batch/${SERVICE_DAY}/dossier.pdf`)
    .buffer()
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        callback(null, Buffer.concat(chunks));
      });
    })
    .expect(200);
  return Buffer.isBuffer(pdf.body) ? pdfPages(pdf.body) : [];
}

async function stepEveStop(flow: Flow): Promise<void> {
  clock.set(at(EVE, "20:01"));
  expect(await autoCloseTour()).toBe("closed");
  expect(
    await ctx.prisma.productionResupply.findMany({
      where: { serviceDay: SERVICE_DAY },
      select: { resupplyId: true, lines: { select: { sku: true, quantity: true } } },
    }),
  ).toEqual([{ resupplyId: flow.resupplyId, lines: [{ sku: CROISSANT, quantity: ASKED }] }]);
  expect((await worksheetLine(ctx)).quantity).toBe(ORDERED + ASKED);
  const dossier = jsonBody<ProductionDayResuppliesView>(
    await staff().get(`/admin/production/batch/${SERVICE_DAY}/resupplies`).expect(200),
  );
  expect(dossier).toMatchObject({
    frozen: true,
    resupplies: [{ resupplyId: flow.resupplyId, lines: [{ quantity: ASKED }] }],
  });
  const last = (await dossierPages()).at(-1);
  expect(last).toContain("RÉASSORT 1/1");
  // « Servi sur place » retiré (Hugo, 2026-10-25) : seul le transfert se dit.
  expect(last).not.toContain("Par transfert");
}

/** R3b (Q1 révisée) et R3c : ni fiche au colisage, ni transfert pour le Labo. */
async function stepNoDurableFacts(flow: Flow): Promise<void> {
  await settle();
  const sheets = jsonBody<PackingResuppliesView>(
    await staff().get(`/admin/packing/${SERVICE_DAY}/resupplies`).expect(200),
  );
  expect(sheets.resupplies).toEqual([]);
  expect(
    await ctx.prisma.deliveryInternalTransfer.findMany({
      where: { serviceDay: SERVICE_DAY, siteId: flow.labo },
    }),
  ).toEqual([]);
  expect(
    await ctx.prisma.deliveryInternalTransferItem.findMany({
      where: { resupplyId: flow.resupplyId },
    }),
  ).toEqual([]);
}

/** R3c, décision 3 : seule la part des commandes descend au colisage. */
async function stepMorningBatch(): Promise<void> {
  clock.set(at(SERVICE_DAY, "06:00"));
  expect(await recordBatch(ctx, BATCH, ORDERED + ASKED)).toBe(204);
  await settle();
  expect(
    await ctx.prisma.productionHandoff.findMany({ select: { id: true, quantity: true } }),
  ).toEqual([{ id: BATCH, quantity: ORDERED }]);
  expect(
    await ctx.prisma.packingStock.findMany({ where: { serviceDay: SERVICE_DAY, sku: CROISSANT } }),
  ).toEqual([expect.objectContaining({ received: ORDERED })]);
}

async function bakehouseHolder(): Promise<request.Agent> {
  const key = "labo-fournil";
  await staff()
    .post("/admin/staff-roles")
    .send({ key, label: key, grants: [{ resource: "production_resupply", action: "write" }] })
    .expect(201);
  const sub = `staff-${key}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: key,
      email: `${key}@lfc.test`,
      role: null,
      roleKey: key,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

async function stepMounted(flow: Flow): Promise<void> {
  clock.set(at(SERVICE_DAY, "07:00"));
  const bakehouse = await bakehouseHolder();
  const route = `/admin/bakehouse-resupplies/sites/${flow.labo}/${flow.resupplyId}/mounted`;
  await bakehouse.post(route).expect(204);
  await settle();
  const first = await ctx.prisma.siteResupply.findUniqueOrThrow({
    where: { id: flow.resupplyId },
  });
  expect(first.arrivedAt).toEqual(at(SERVICE_DAY, "07:00"));

  // Un second « Monté », une minute plus tard : sans effet.
  clock.set(at(SERVICE_DAY, "07:01"));
  await bakehouse.post(route).expect(204);
  await settle();
  const again = await ctx.prisma.siteResupply.findUniqueOrThrow({
    where: { id: flow.resupplyId },
  });
  expect(again.arrivedAt).toEqual(first.arrivedAt);
  expect(again.version).toBe(first.version);
  expect(
    await ctx.prisma.staffNotification.findMany({
      where: { kind: "resupply.arrived" },
      select: { subject: true, audience: true },
    }),
  ).toEqual([
    {
      subject: `Réassort arrivé — à réceptionner : ${NAME} — Le Labo`,
      audience: "handover_counter:read",
    },
  ]);
}

async function receiptOf(labo: string): Promise<ResupplyReceiptView> {
  return jsonBody<ResupplyReceiptView>(
    await staff().get(`/admin/resupply-receipts/${labo}/${SERVICE_DAY}`).expect(200),
  );
}

async function stepReception(flow: Flow): Promise<void> {
  const before = await receiptOf(flow.labo);
  expect(before.receptions).toMatchObject([
    { resupplyId: flow.resupplyId, name: NAME, lines: [{ expectedQuantity: ASKED }] },
  ]);
  await staff()
    .post(`/admin/resupply-receipts/${flow.labo}/resupplies/${flow.resupplyId}/receive`)
    .expect(204);

  const after = await receiptOf(flow.labo);
  expect(after.stock).toMatchObject([{ sku: CROISSANT, receivedQuantity: ASKED }]);
  const overview = jsonBody<DayStockOverviewView>(
    await staff().get(`/admin/supervision/stock/${SERVICE_DAY}`).expect(200),
  );
  const atLabo = overview.sites.find((site) => site.siteId === flow.labo);
  expect(atLabo?.resupplies).toMatchObject([{ resupplyId: flow.resupplyId, state: "received" }]);
  expect(atLabo?.products).toMatchObject([{ sku: CROISSANT, stock: ASKED }]);
}

describe("le parcours du Labo, de l'envoi au stock du jour", () => {
  it("le réassort « pour demain » d'un point servi sur place s'enchaîne de bout en bout", async () => {
    await ctx.reset();
    // 1. J-1 15:00 — le comptoir envoie « Vitrine du matin », un client commande au Labo.
    const flow = await stepEveAfternoon();
    // 2. J-1 20:01 — l'arrêt automatique fige le plan ; bon « Servi sur place » au dossier.
    await stepEveStop(flow);
    // 3. Les faits vidés : ni fiche au colisage, ni transfert pour le Labo.
    await stepNoDurableFacts(flow);
    // 4. J 06:00 — la fournée : seule la part des commandes descend au colisage.
    await stepMorningBatch();
    // 5. J 07:00 — « Monté » : arrivé, cloche au comptoir ; le second est sans effet.
    await stepMounted(flow);
    // 6. Le comptoir réceptionne 20 ; la Supervision lit le stock du jour.
    await stepReception(flow);
  });
});
