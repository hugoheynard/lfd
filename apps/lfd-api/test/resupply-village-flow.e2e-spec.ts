/**
 * E2E du **parcours du Village**, d'un seul tenant : le réassort « pour
 * demain » d'un point servi par transfert, de l'envoi au comptoir jusqu'au
 * stock du jour lu par la Supervision (R3a–R3e, S1 de
 * `documentation/reassort-boutiques/README.md`).
 *
 * Chaque maillon a sa suite (`resupply-frozen-plan`, `resupply-packing`,
 * `resupply-transfer`, `resupply-arrived`, `resupply-transfer-reception`,
 * `resupply-receipt`, `supervision-stock`). Ce qui ne s'éprouve qu'ici :
 * qu'ils S'ENCHAÎNENT — chaque étape part de ce que la précédente a laissé
 * en base, par les vraies routes et la vraie boîte d'envoi, sans écriture
 * de raccord.
 *
 * La même demande porte une ligne AU POIDS (lot L2b-3 de
 * `limites-de-commande/jour-meme-sur-stock.md`) : 2 kg de gravlax,
 * comptés et imprimés en grammes au fournil, colisés en un lot de 1,94 kg,
 * partis au manifeste en kilos, reçus en grammes au Village — et les
 * croissants à côté, inchangés.
 *
 * L'horloge est figée et SAUTE d'une étape à l'autre : la veille (J-1) puis
 * le jour servi (J, dans une semaine). Aucune date du calendrier.
 *
 * Les étapes de la veille (1 à 3) vivent dans `resupply-village-scene.ts`
 * depuis le 2026-11-02 ; celles du jour J restent ici.
 */
import type {
  DayStockOverviewView,
  HandoverQueueView,
  InternalTransferManifestView,
  MyDeliveryRoundView,
  PackingResuppliesView,
  ResupplyReceiptView,
} from "@lfd/contracts";

import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { MY_ROUND, staffWithRole } from "./delivery-driver-scene.js";
import { depart, loadBin } from "./delivery-loading-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, ROUNDS, roundOf } from "./delivery-rounds-scene.js";
import { ROAD_ROUTING_OVERRIDES } from "./delivery-routing-scene.js";
import { declareTransferBins, FixedRoad } from "./internal-transfer-scene.js";
import {
  bootstrapProductionDay,
  CROISSANT,
  recordBatch,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import {
  ASKED,
  ASKED_GRAMS,
  at,
  BATCH,
  BATCH_GRAMS,
  type Flow,
  GRAVLAX,
  NAME,
  ORDERED,
  PACKED,
  PACKED_GRAMS,
  pdfPagesOf,
  settle,
  stepDurableFacts,
  stepEveAfternoon,
  stepEveStop,
  type VillageScene,
} from "./resupply-village-scene.js";

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

/** Ce que les étapes de la veille reçoivent : la même application, la même horloge. */
function scene(): VillageScene {
  return { ctx, clock, issued };
}

const staff = () => ctx.asSub(STAFF);

async function stepMorningPacking(flow: Flow): Promise<void> {
  clock.set(at(SERVICE_DAY, "06:00"));
  expect(await recordBatch(ctx, BATCH, ORDERED + ASKED)).toBe(204);
  expect(await recordBatch(ctx, BATCH_GRAMS, ASKED_GRAMS, GRAVLAX)).toBe(204);
  await settle(scene());
  const sheet = `/admin/packing/${SERVICE_DAY}/resupplies/${flow.resupplyId}`;
  await staff().put(`${sheet}/lines/${CROISSANT}`).send({ quantity: PACKED }).expect(204);
  // Le lot au poids, pesé : 1,94 kg — jamais plus que les 2 kg demandés.
  await staff()
    .put(`${sheet}/lines/${GRAVLAX}`)
    .send({ quantity: ASKED_GRAMS + 1 })
    .expect(400);
  await staff().put(`${sheet}/lines/${GRAVLAX}`).send({ quantity: PACKED_GRAMS }).expect(204);
  await staff().post(`${sheet}/close`).expect(204);
  await settle(scene());
  const after = jsonBody<PackingResuppliesView>(
    await staff().get(`/admin/packing/${SERVICE_DAY}/resupplies`).expect(200),
  );
  expect(after.resupplies[0]).toMatchObject({
    status: "closed",
    lines: [
      { sku: GRAVLAX, requested: ASKED_GRAMS, saleUnit: "weight", packed: PACKED_GRAMS },
      { sku: CROISSANT, requested: ASKED, saleUnit: "piece", packed: PACKED },
    ],
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
  await settle(scene());

  const manifest = await manifestOf(transferId);
  expect(manifest.frozen).toBe(true);
  expect(manifest.resupplies.totals).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sku: CROISSANT, quantity: PACKED, saleUnit: "piece" }),
      expect.objectContaining({ sku: GRAVLAX, quantity: PACKED_GRAMS, saleUnit: "weight" }),
    ]),
  );
  expect(manifest.resupplies.totals).toHaveLength(2);
  // Le papier de la tournée dit le lot en kilos, pas « 1940 × ».
  const paper = (await pdfPagesOf(scene(), `/admin/delivery/rounds/${roundId}/round.pdf`)).join(
    "\n",
  );
  expect(paper).toContain("1,94 kg");
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
  await settle(scene());

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
  expect(before.receptions).toMatchObject([{ resupplyId: flow.resupplyId, name: NAME }]);
  // La réception se pré-remplit de l'emballé, en grammes pour le lot au poids.
  const expected = [...(before.receptions[0]?.lines ?? [])].sort((a, b) =>
    a.sku.localeCompare(b.sku),
  );
  expect(expected).toMatchObject([
    { sku: GRAVLAX, expectedQuantity: PACKED_GRAMS, saleUnit: "weight" },
    { sku: CROISSANT, expectedQuantity: PACKED, saleUnit: "piece" },
  ]);
  await staff()
    .post(`/admin/resupply-receipts/${flow.village}/resupplies/${flow.resupplyId}/receive`)
    .expect(204);

  const after = await receiptOf(flow.village);
  expect(after.stock).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sku: CROISSANT, receivedQuantity: PACKED, estimatedStock: PACKED }),
      expect.objectContaining({
        sku: GRAVLAX,
        receivedQuantity: PACKED_GRAMS,
        estimatedStock: PACKED_GRAMS,
        saleUnit: "weight",
      }),
    ]),
  );
  const overview = jsonBody<DayStockOverviewView>(
    await staff().get(`/admin/supervision/stock/${SERVICE_DAY}`).expect(200),
  );
  const atVillage = overview.sites.find((site) => site.siteId === flow.village);
  expect(atVillage?.resupplies).toMatchObject([{ resupplyId: flow.resupplyId, state: "received" }]);
  expect(atVillage?.products).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sku: CROISSANT, stock: PACKED }),
      expect.objectContaining({ sku: GRAVLAX, stock: PACKED_GRAMS, saleUnit: "weight" }),
    ]),
  );
}

describe("le parcours du Village, de l'envoi au stock du jour", () => {
  it("le réassort « pour demain » d'un point servi par transfert s'enchaîne de bout en bout", async () => {
    await ctx.reset();
    // 1. J-1 15:00 — le comptoir envoie « Vitrine du matin », un client commande au Village.
    const flow = await stepEveAfternoon(scene());
    // 2. J-1 20:01 — le tour d'arrêt automatique fige le plan à la plus tardive des heures.
    await stepEveStop(scene(), flow);
    // 3. Les faits durables : une fiche au colisage, un transfert qui porte commande et réassort.
    const transferId = await stepDurableFacts(scene(), flow);
    // 4. J 06:00 — les fournées descendent au colisage : 18 croissants sur 20, 1,94 kg sur 2, close.
    await stepMorningPacking(flow);
    // 5. J 07:30 — placé, chargé, parti : le manifeste fige 18, 1,94 kg et la commande.
    const { roundId, paul } = await stepDeparture(transferId);
    // 6. J 09:00 — « Remis au site » : réassort arrivé, cloche au comptoir, commande retirable.
    await stepSiteDrop(flow, roundId, paul);
    // 7. Le comptoir réceptionne 18 et 1 940 g ; la Supervision lit le stock du jour.
    await stepReception(flow);
  });
});
