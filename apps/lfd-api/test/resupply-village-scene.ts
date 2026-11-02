/**
 * **La veille du parcours du Village** — l'envoi du comptoir, l'arrêt du
 * plan et les faits durables (étapes 1 à 3 de
 * `resupply-village-flow.e2e-spec.ts`), sortis de la suite le 2026-11-02
 * pour qu'elle tienne en un fichier. Le parcours reste d'un seul tenant :
 * la suite enchaîne ces étapes puis celles du jour J, sans écriture de
 * raccord.
 */
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import type { PackingResuppliesView, ProductionDayResuppliesView } from "@lfd/contracts";
import { addDays, localToInstant } from "@lfd/contracts";

import { WEIGHED_GRAVLAX } from "../src/dev/seeding/delivery-day.seed.js";
import { pdfPages } from "../src/platform/pdf/__tests__/pdf-text.js";
import type { FixedClock } from "../src/platform/time/fixed-clock.js";
import { settleCardPayments } from "./card-payments.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { seedDriverRole } from "./delivery-driver-scene.js";
import { binTypeId } from "./delivery-loading-scene.js";
import { addVehicle } from "./delivery-rounds-scene.js";
import { MEASURED, seedDeparture } from "./delivery-routing-scene.js";
import { seedVillage } from "./internal-transfer-scene.js";
import { CROISSANT, MEMBER, SERVICE_DAY, STAFF, worksheetLine } from "./production-day-fixture.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";
import { seedWeighedArticles } from "./weighed-catalog-scene.js";

export const EVE = addDays(SERVICE_DAY, -1);
export const NAME = "Vitrine du matin";
export const ASKED = 20;
export const PACKED = 18;
export const ORDERED = 4;
/** Le saumon gravlax du corpus, vendu au poids : 2 kg demandés, un lot de 1,94 kg emballé. */
export const GRAVLAX = `${WEIGHED_GRAVLAX}-1`;
export const ASKED_GRAMS = 2_000;
export const PACKED_GRAMS = 1_940;
export const BATCH_GRAMS = "01K6A0000000000000000000VG";
export const BATCH = "01K6A0000000000000000000VF";

/** Ce que les étapes partagent : l'application, l'horloge figée, les paiements émis. */
export interface VillageScene {
  readonly ctx: E2eContext;
  readonly clock: FixedClock;
  readonly issued: string[];
}

/** L'instant de la maison `time` le jour `day`, à l'heure de Paris. */
export function at(day: string, time: string): Date {
  const instant = localToInstant(day, time);
  if (instant === null) {
    throw new TypeError(`heure locale inexistante : ${day} ${time}`);
  }
  return instant;
}

/** Laisse la boîte d'envoi livrer les faits en chaîne. */
export async function settle(s: VillageScene): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await s.ctx.drain();
  }
}

export function staffOf(s: VillageScene): ReturnType<E2eContext["asSub"]> {
  return s.ctx.asSub(STAFF);
}

/** Ce que les étapes se passent : rien n'est relu ailleurs qu'en base. */
export interface Flow {
  readonly village: string;
  readonly resupplyId: string;
}

/** Générale la veille à 18:00 sans rattrapage, réassort la veille à 20:00 (comme R3a). */
async function twoHours(s: VillageScene): Promise<void> {
  await staffOf(s)
    .put("/admin/order-cutoffs/general")
    .send({ daysBefore: 1, time: "18:00", graceMinutes: 0 })
    .expect(204);
  await staffOf(s)
    .patch("/admin/order-cutoff-settings")
    .send({ resupplyCutoffTime: "20:00" })
    .expect(204);
}

/** Le comptoir nomme sa demande « pour demain », y pose ses croissants, et l'envoie. */
async function counterSendsNamed(s: VillageScene, village: string): Promise<string> {
  const base = `/admin/site-resupplies/sites/${village}`;
  await staffOf(s).put(`${base}/drafts/tomorrow/name`).send({ name: NAME }).expect(200);
  const added = await staffOf(s)
    .post(`${base}/drafts/tomorrow/lines`)
    .send({ sku: CROISSANT, quantity: ASKED })
    .expect(201);
  // Le vrai envoi du comptoir, avec une ligne au poids : la garde de L2b-1 est retirée.
  await staffOf(s)
    .post(`${base}/drafts/tomorrow/lines`)
    .send({ sku: GRAVLAX, quantity: ASKED_GRAMS })
    .expect(201);
  const id = jsonBody<{ id: string }>(added).id;
  const view = jsonBody<{ drafts: readonly { id: string; version: number }[] }>(
    await staffOf(s).get(base).expect(200),
  );
  const version = view.drafts.find((draft) => draft.id === id)?.version;
  await staffOf(s).post(`${base}/${id}/send`).send({ version }).expect(204);
  return id;
}

/** Un client passe un click and collect PAYÉ, à retirer au Village le jour J. */
async function customerOrdersAtVillage(s: VillageScene, village: string): Promise<void> {
  await s.ctx
    .asSub(MEMBER)
    .post("/orders")
    .send({
      idempotencyKey: randomUUID(),
      salesTerms: null,
      companyId: null,
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "pickup",
      requestedWindow: { start: "07:30", end: "09:00" },
      pickupAddressId: village,
      note: "",
      lines: [{ sku: CROISSANT, quantity: ORDERED }],
    })
    .expect(201);
  await settleCardPayments(s.ctx, s.issued);
}

export async function stepEveAfternoon(s: VillageScene): Promise<Flow> {
  s.clock.set(at(EVE, "15:00"));
  await seedWeighedArticles(s.ctx);
  await seedDeparture(s.ctx);
  await addVehicle(s.ctx, "Kangoo", MEASURED);
  await seedDriverRole(s.ctx);
  // Un type de bac en service : sans lui, la composition du soir refuse de proposer.
  await binTypeId(s.ctx);
  const village = await seedVillage(s.ctx);
  // Le point « sur place » existe à côté : il ne doit rien emprunter au parcours.
  await s.ctx.prisma.site.create({
    data: {
      label: "Le Labo",
      ligne1: "1 place",
      codePostal: "73150",
      ville: "Val",
      pays: "France",
    },
  });
  await twoHours(s);
  const resupplyId = await counterSendsNamed(s, village);
  await customerOrdersAtVillage(s, village);
  return { village, resupplyId };
}

async function autoCloseTour(s: VillageScene): Promise<string> {
  const response = await s.ctx
    .http()
    .post("/admin/production/auto-close")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await s.ctx.drain();
  return jsonBody<{ outcome: string }>(response).outcome;
}

export async function pdfPagesOf(s: VillageScene, path: string): Promise<readonly string[]> {
  const pdf = await staffOf(s)
    .get(path)
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

export async function stepEveStop(s: VillageScene, flow: Flow): Promise<void> {
  // L'heure client est passée, pas celle du réassort : l'arrêt attend.
  s.clock.set(at(EVE, "19:00"));
  expect(await autoCloseTour(s)).toBe("nothing");
  s.clock.set(at(EVE, "20:01"));
  expect(await autoCloseTour(s)).toBe("closed");

  const day = await s.ctx.prisma.productionDay.findUniqueOrThrow({
    where: { serviceDay: SERVICE_DAY },
    select: { closedAt: true },
  });
  expect(day.closedAt).toEqual(at(EVE, "20:01"));
  expect(
    await s.ctx.prisma.productionResupply.findMany({
      where: { serviceDay: SERVICE_DAY },
      select: {
        resupplyId: true,
        lines: { select: { sku: true, quantity: true, saleUnit: true }, orderBy: { sku: "asc" } },
      },
    }),
  ).toEqual([
    {
      resupplyId: flow.resupplyId,
      lines: [
        { sku: GRAVLAX, quantity: ASKED_GRAMS, saleUnit: "weight" },
        { sku: CROISSANT, quantity: ASKED, saleUnit: "piece" },
      ],
    },
  ]);
  expect((await worksheetLine(s.ctx)).quantity).toBe(ORDERED + ASKED);
  // Le compte du fournil : des grammes, pas 2 000 pièces.
  expect(await worksheetLine(s.ctx, GRAVLAX)).toMatchObject({
    quantity: ASKED_GRAMS,
    saleUnit: "weight",
  });
  const dossier = jsonBody<ProductionDayResuppliesView>(
    await staffOf(s).get(`/admin/production/batch/${SERVICE_DAY}/resupplies`).expect(200),
  );
  expect(dossier).toMatchObject({
    frozen: true,
    // La vue de l'écran du fournil ne porte pas encore l'unité (lot L2b-4).
    resupplies: [
      { resupplyId: flow.resupplyId, lines: [{ quantity: ASKED }, { quantity: ASKED_GRAMS }] },
    ],
  });
  const pages = await pdfPagesOf(s, `/admin/production/batch/${SERVICE_DAY}/dossier.pdf`);
  // La couverture dit la part du réassort au rayon, et que le point est servi
  // par transfert (mise en page du 2026-10-25) ; le bon ferme le dossier.
  expect(pages[0]).toMatch(
    new RegExp(`dont ${String(ASKED)} réassort\\s+${String(ORDERED + ASKED)} pièces`, "u"),
  );
  expect(pages[0]).toContain("Par transfert");
  expect(pages.at(-1)).toContain("RÉASSORT 1/1");
  // Le bon de réassort dit le poids sur la ligne (L2b-2).
  expect(pages.at(-1)).toContain("2 kg");
}

export async function stepDurableFacts(s: VillageScene, flow: Flow): Promise<string> {
  await settle(s);
  const sheets = jsonBody<PackingResuppliesView>(
    await staffOf(s).get(`/admin/packing/${SERVICE_DAY}/resupplies`).expect(200),
  );
  expect(sheets.resupplies).toMatchObject([
    {
      resupplyId: flow.resupplyId,
      title: `${NAME} — Val Village`,
      status: "open",
      lines: [
        { sku: GRAVLAX, requested: ASKED_GRAMS, saleUnit: "weight", packed: null },
        { sku: CROISSANT, requested: ASKED, saleUnit: "piece", packed: null },
      ],
    },
  ]);
  const transfers = await s.ctx.prisma.deliveryInternalTransfer.findMany({
    where: { serviceDay: SERVICE_DAY },
    select: { id: true, siteId: true },
  });
  expect(transfers.map((transfer) => transfer.siteId)).toEqual([flow.village]);
  const transferId = transfers[0]?.id ?? "";
  const items = await s.ctx.prisma.deliveryInternalTransferItem.findMany({
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
