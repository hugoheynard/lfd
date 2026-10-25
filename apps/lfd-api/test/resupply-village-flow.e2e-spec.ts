/**
 * E2E du **parcours du Village**, d'un seul tenant : le réassort « pour
 * demain » d'un point servi par transfert, de l'envoi au comptoir jusqu'au
 * stock du jour lu par la Supervision (R3a–R3e, S1 de
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md` §13).
 *
 * Chaque maillon a sa suite (`resupply-frozen-plan`, `resupply-packing`,
 * `resupply-transfer`, `resupply-arrived`, `resupply-transfer-reception`,
 * `resupply-receipt`, `supervision-stock`). Ce qui ne s'éprouve qu'ici :
 * qu'ils S'ENCHAÎNENT — chaque étape part de ce que la précédente a laissé
 * en base, par les vraies routes et la vraie boîte d'envoi, sans écriture
 * de raccord.
 *
 * L'horloge est figée et SAUTE d'une étape à l'autre : la veille (J-1) puis
 * le jour servi (J, dans une semaine). Aucune date du calendrier.
 */
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import type {
  DayStockOverviewView,
  HandoverQueueView,
  InternalTransferManifestView,
  MyDeliveryRoundView,
  PackingResuppliesView,
  ProductionDayResuppliesView,
  ResupplyReceiptView,
} from "@lfd/contracts";
import { addDays, localToInstant } from "@lfd/contracts";

import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { pdfPages } from "../src/platform/pdf/__tests__/pdf-text.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { settleCardPayments } from "./card-payments.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { MY_ROUND, seedDriverRole, staffWithRole } from "./delivery-driver-scene.js";
import { binTypeId, depart, loadBin } from "./delivery-loading-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, addVehicle, ROUNDS, roundOf } from "./delivery-rounds-scene.js";
import { MEASURED, ROAD_ROUTING_OVERRIDES, seedDeparture } from "./delivery-routing-scene.js";
import { declareTransferBins, FixedRoad, seedVillage } from "./internal-transfer-scene.js";
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
const PACKED = 18;
const ORDERED = 4;
const BATCH = "01K6A0000000000000000000VF";
const clock = new FixedClock(new Date());
let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay([
    { token: Clock, value: clock },
    { token: RoadTravelTimeReader, value: new FixedRoad() },
    ...ROAD_ROUTING_OVERRIDES,
    // Le jeton porteur EST le `sub` : le livreur est une autre fiche que le staff.
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

/** Ce que les étapes se passent : rien n'est relu ailleurs qu'en base. */
interface Flow {
  readonly village: string;
  readonly resupplyId: string;
}

/** Générale la veille à 18:00 sans rattrapage, réassort la veille à 20:00 (comme R3a). */
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

/** Le comptoir nomme sa demande « pour demain », y pose ses croissants, et l'envoie. */
async function counterSendsNamed(village: string): Promise<string> {
  const base = `/admin/site-resupplies/sites/${village}`;
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

/** Un client passe un click and collect PAYÉ, à retirer au Village le jour J. */
async function customerOrdersAtVillage(village: string): Promise<void> {
  await ctx
    .asSub(MEMBER)
    .post("/orders")
    .send({
      idempotencyKey: randomUUID(),
      companyId: null,
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "pickup",
      requestedWindow: { start: "07:30", end: "09:00" },
      pickupAddressId: village,
      note: "",
      lines: [{ sku: CROISSANT, quantity: ORDERED }],
    })
    .expect(201);
  await settleCardPayments(ctx, issued);
}

async function stepEveAfternoon(): Promise<Flow> {
  clock.set(at(EVE, "15:00"));
  await seedDeparture(ctx);
  await addVehicle(ctx, "Kangoo", MEASURED);
  await seedDriverRole(ctx);
  // Un type de bac en service : sans lui, la composition du soir refuse de proposer.
  await binTypeId(ctx);
  const village = await seedVillage(ctx);
  // Le point « sur place » existe à côté : il ne doit rien emprunter au parcours.
  await ctx.prisma.site.create({
    data: {
      label: "Le Labo",
      ligne1: "1 place",
      codePostal: "73150",
      ville: "Val",
      pays: "France",
    },
  });
  await twoHours();
  const resupplyId = await counterSendsNamed(village);
  await customerOrdersAtVillage(village);
  return { village, resupplyId };
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

async function dossierPdfFirstAndLast(): Promise<readonly string[]> {
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
  // L'heure client est passée, pas celle du réassort : l'arrêt attend.
  clock.set(at(EVE, "19:00"));
  expect(await autoCloseTour()).toBe("nothing");
  clock.set(at(EVE, "20:01"));
  expect(await autoCloseTour()).toBe("closed");

  const day = await ctx.prisma.productionDay.findUniqueOrThrow({
    where: { serviceDay: SERVICE_DAY },
    select: { closedAt: true },
  });
  expect(day.closedAt).toEqual(at(EVE, "20:01"));
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
  const pages = await dossierPdfFirstAndLast();
  // La couverture dit la part du réassort au rayon, et que le point est servi
  // par transfert (mise en page du 2026-10-25) ; le bon ferme le dossier.
  expect(pages[0]).toMatch(
    new RegExp(`dont ${String(ASKED)} réassort\\s+${String(ORDERED + ASKED)} pièces`, "u"),
  );
  expect(pages[0]).toContain("Par transfert");
  expect(pages.at(-1)).toContain("RÉASSORT 1/1");
}

async function stepDurableFacts(flow: Flow): Promise<string> {
  await settle();
  const sheets = jsonBody<PackingResuppliesView>(
    await staff().get(`/admin/packing/${SERVICE_DAY}/resupplies`).expect(200),
  );
  expect(sheets.resupplies).toMatchObject([
    {
      resupplyId: flow.resupplyId,
      title: `${NAME} — Val Village`,
      status: "open",
      lines: [{ sku: CROISSANT, requested: ASKED, packed: null }],
    },
  ]);
  const transfers = await ctx.prisma.deliveryInternalTransfer.findMany({
    where: { serviceDay: SERVICE_DAY },
    select: { id: true, siteId: true },
  });
  expect(transfers.map((transfer) => transfer.siteId)).toEqual([flow.village]);
  const transferId = transfers[0]?.id ?? "";
  const items = await ctx.prisma.deliveryInternalTransferItem.findMany({
    where: { transferId, detachedAt: null },
    select: { kind: true, resupplyId: true },
    orderBy: { kind: "asc" },
  });
  expect(items).toEqual([
    { kind: "order", resupplyId: null },
    { kind: "resupply", resupplyId: flow.resupplyId },
  ]);
  return transferId;
}

async function stepMorningPacking(flow: Flow): Promise<void> {
  clock.set(at(SERVICE_DAY, "06:00"));
  expect(await recordBatch(ctx, BATCH, ORDERED + ASKED)).toBe(204);
  await settle();
  const sheet = `/admin/packing/${SERVICE_DAY}/resupplies/${flow.resupplyId}`;
  await staff().put(`${sheet}/lines/${CROISSANT}`).send({ quantity: PACKED }).expect(204);
  await staff().post(`${sheet}/close`).expect(204);
  await settle();
  const after = jsonBody<PackingResuppliesView>(
    await staff().get(`/admin/packing/${SERVICE_DAY}/resupplies`).expect(200),
  );
  expect(after.resupplies[0]).toMatchObject({
    status: "closed",
    lines: [{ requested: ASKED, packed: PACKED }],
  });
}

async function manifestOf(transferId: string): Promise<InternalTransferManifestView> {
  return jsonBody<InternalTransferManifestView>(
    await staff().get(`/admin/delivery/transfers/${transferId}/manifest`).expect(200),
  );
}

/** Le transfert est placé par la composition, chargé, et la tournée part, confiée à Paul. */
async function stepDeparture(transferId: string): Promise<{ roundId: string; paul: Paul }> {
  clock.set(at(SERVICE_DAY, "07:30"));
  const stops = await ctx.prisma.deliveryRoundStop.findMany({
    where: { transferId },
    select: { roundId: true, kind: true },
  });
  if (stops.length !== 1) {
    throw new Error(
      `Le transfert du Village devait être placé dans UNE tournée par la composition : ${String(stops.length)} arrêt(s).`,
    );
  }
  const roundId = stops[0]?.roundId ?? "";
  const paul = await staffWithRole(ctx, "staff-paul");
  const { version } = await roundOf(ctx, SERVICE_DAY, roundId);
  await staff()
    .put(`${ROUNDS}/${roundId}/driver`)
    .send({ staffUserId: paul.id, version })
    .expect(204);
  const [binId] = await declareTransferBins(ctx, transferId, 1);
  await loadBin(ctx, roundId, { binId: binId ?? "" }).expect(204);
  expect((await depart(ctx, roundId)).status).toBe(204);
  await settle();

  const manifest = await manifestOf(transferId);
  expect(manifest.frozen).toBe(true);
  expect(manifest.resupplies.totals).toEqual([
    expect.objectContaining({ sku: CROISSANT, quantity: PACKED }),
  ]);
  expect(manifest.orders.totals).toEqual([
    expect.objectContaining({ sku: CROISSANT, quantity: ORDERED }),
  ]);
  return { roundId, paul };
}

type Paul = Awaited<ReturnType<typeof staffWithRole>>;

async function counterQueue(): Promise<HandoverQueueView> {
  return jsonBody<HandoverQueueView>(
    await staff().get(`/admin/handover/file?jour=${SERVICE_DAY}`).expect(200),
  );
}

async function stepSiteDrop(flow: Flow, roundId: string, paul: Paul): Promise<void> {
  clock.set(at(SERVICE_DAY, "09:00"));
  const mine = jsonBody<MyDeliveryRoundView>(
    await paul.agent.get(`${MY_ROUND}/${roundId}`).expect(200),
  );
  const stopId = mine.transferStops?.[0]?.stopId ?? "";
  await paul.agent
    .post(`${MY_ROUND}/${roundId}/stops/${stopId}/site-drop`)
    .send({ version: mine.version })
    .expect(204);
  await settle();

  const resupply = await ctx.prisma.siteResupply.findUniqueOrThrow({
    where: { id: flow.resupplyId },
    select: { arrivedAt: true },
  });
  expect(resupply.arrivedAt).toEqual(at(SERVICE_DAY, "09:00"));
  expect(
    await ctx.prisma.staffNotification.findMany({
      where: { kind: "resupply.arrived" },
      select: { subject: true, audience: true },
    }),
  ).toEqual([
    {
      subject: `Réassort arrivé — à réceptionner : ${NAME} — Val Village`,
      audience: "handover_counter:read",
    },
  ]);
  const entry = (await counterQueue()).entries.find((row) => row.siteId === flow.village);
  expect(entry?.transfer).toMatchObject({ state: "received" });
  await staff()
    .post(`/admin/handover/manual/${entry?.reference ?? ""}`)
    .expect(201);
  const handed = (await counterQueue()).entries.find((row) => row.orderId === entry?.orderId);
  expect(handed?.state).toBe("handed_over");
}

async function receiptOf(village: string): Promise<ResupplyReceiptView> {
  return jsonBody<ResupplyReceiptView>(
    await staff().get(`/admin/resupply-receipts/${village}/${SERVICE_DAY}`).expect(200),
  );
}

async function stepReception(flow: Flow): Promise<void> {
  const before = await receiptOf(flow.village);
  expect(before.receptions).toMatchObject([
    { resupplyId: flow.resupplyId, name: NAME, lines: [{ expectedQuantity: PACKED }] },
  ]);
  await staff()
    .post(`/admin/resupply-receipts/${flow.village}/resupplies/${flow.resupplyId}/receive`)
    .expect(204);

  const after = await receiptOf(flow.village);
  expect(after.stock).toMatchObject([
    { sku: CROISSANT, receivedQuantity: PACKED, estimatedStock: PACKED },
  ]);
  const overview = jsonBody<DayStockOverviewView>(
    await staff().get(`/admin/supervision/stock/${SERVICE_DAY}`).expect(200),
  );
  const atVillage = overview.sites.find((site) => site.siteId === flow.village);
  expect(atVillage?.resupplies).toMatchObject([{ resupplyId: flow.resupplyId, state: "received" }]);
  expect(atVillage?.products).toMatchObject([{ sku: CROISSANT, stock: PACKED }]);
}

describe("le parcours du Village, de l'envoi au stock du jour", () => {
  it("le réassort « pour demain » d'un point servi par transfert s'enchaîne de bout en bout", async () => {
    await ctx.reset();
    // 1. J-1 15:00 — le comptoir envoie « Vitrine du matin », un client commande au Village.
    const flow = await stepEveAfternoon();
    // 2. J-1 20:01 — le tour d'arrêt automatique fige le plan à la plus tardive des heures.
    await stepEveStop(flow);
    // 3. Les faits durables : une fiche au colisage, un transfert qui porte commande et réassort.
    const transferId = await stepDurableFacts(flow);
    // 4. J 06:00 — la fournée descend au colisage, 18 emballés sur 20, fiche close.
    await stepMorningPacking(flow);
    // 5. J 07:30 — placé, chargé, parti : le manifeste fige 18 et la commande.
    const { roundId, paul } = await stepDeparture(transferId);
    // 6. J 09:00 — « Remis au site » : réassort arrivé, cloche au comptoir, commande retirable.
    await stepSiteDrop(flow, roundId, paul);
    // 7. Le comptoir réceptionne 18 ; la Supervision lit le stock du jour.
    await stepReception(flow);
  });
});
