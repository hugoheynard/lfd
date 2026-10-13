/**
 * E2E des **bacs du transfert interne** (lot T3 —
 * `documentation/livraisons/transferts/plan-transfert-interne.md`, Q-T4
 * révisée par Hugo le 2026-10-13, faille F4).
 *
 * Ce que seul le vrai SQL prouve : qu'un bac porte exactement un sujet
 * (`delivery_bin_subject_check`), que les bacs d'un transfert se déclarent au
 * chargement, se lisent, se chargent sur l'arrêt du transfert et font partir
 * la tournée, que la file du comptoir et la réception les comptent, et qu'une
 * commande du site qu'aucun transfert ne porte encore est refusée au comptoir.
 */
import type {
  DeliveryBinDetailView,
  DeliveryTransferBinsView,
  HandoverQueueView,
} from "@lfd/contracts";

import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { atTheDesk, BINS, binTypeId, depart, loadBin, LOADING } from "./delivery-loading-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import { ROAD_ROUTING_OVERRIDES } from "./delivery-routing-scene.js";
import {
  codeOf,
  composedTransfer,
  declareTransferBins,
  FixedRoad,
  handOverAtCounter,
  receiveAtCounter,
  seedVillage,
  seedVillageOrder,
} from "./internal-transfer-scene.js";

const DAY = serviceDay();

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      ...ROAD_ROUTING_OVERRIDES,
      { token: RoadTravelTimeReader, value: new FixedRoad() },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

describe("les bacs du transfert (lot T3, Q-T4 révisée)", () => {
  it("« Partir » exige au moins un bac du transfert ; ses commandes n'en ont plus à elles", async () => {
    const { orderId, transferId } = await composedTransfer(ctx, DAY);
    const round = await ctx.prisma.deliveryRound.findFirstOrThrow({ select: { id: true } });

    const empty = await depart(ctx, round.id);
    expect(empty.status).toBe(409);
    expect(codeOf(empty)).toBe("delivery.round_not_ready");
    expect(jsonBody<{ readonly message: string }>(empty).message).toMatch(/→ Val Village/u);

    // Le colisage ne déclare plus de bac à une commande du village : elle part en sacs.
    await expect(
      atTheDesk(ctx, async (desk) =>
        desk.declareBin({ orderId, binTypeId: await binTypeId(ctx), half: false, innerBags: 0 }),
      ),
    ).rejects.toThrow(/bacs du transfert/u);

    const binIds = await declareTransferBins(ctx, transferId, 2);
    expect(binIds).toHaveLength(2);
    const rows = await ctx.prisma.deliveryBin.findMany({
      select: { orderId: true, transferId: true, half: true, innerBags: true },
    });
    expect(rows).toEqual([
      { orderId: null, transferId, half: null, innerBags: 2 },
      { orderId: null, transferId, half: null, innerBags: 2 },
    ]);

    const labels = jsonBody<DeliveryTransferBinsView>(
      await admin(ctx).get(`${LOADING}/loading/transfers/${transferId}/bins`).expect(200),
    );
    expect(labels).toMatchObject({ transferId, siteLabel: "Val Village", day: DAY });
    expect(labels.bins.map((bin) => [bin.orderId, bin.reference, bin.index, bin.total])).toEqual([
      [null, "→ Val Village", 1, 2],
      [null, "→ Val Village", 2, 2],
    ]);
    const detail = jsonBody<DeliveryBinDetailView>(
      await admin(ctx)
        .get(`${BINS}/${binIds[0] ?? ""}`)
        .expect(200),
    );
    expect(detail.bin.transfer).toEqual({ transferId, siteLabel: "Val Village" });
    expect(detail.round?.roundId).toBe(round.id);

    await loadBin(ctx, round.id, { binId: binIds[0] ?? "" }).expect(204);
    expect((await depart(ctx, round.id)).status).toBe(409);
    await loadBin(ctx, round.id, { binId: binIds[1] ?? "" }).expect(204);
    expect((await depart(ctx, round.id)).status).toBe(204);

    const late = await admin(ctx)
      .post(`${LOADING}/loading/transfers/${transferId}/bins`)
      .send({ binTypeId: await binTypeId(ctx), count: 1, innerBags: 0 })
      .expect(409);
    expect(codeOf(late)).toBe("delivery.internal_transfer_bins_closed");
  });

  it("la file du comptoir expose les bacs du transfert, et la réception les compte", async () => {
    const { orderId, transferId } = await composedTransfer(ctx, DAY);
    await declareTransferBins(ctx, transferId, 3);

    const queue = jsonBody<HandoverQueueView>(
      await admin(ctx).get(`/admin/handover/file?jour=${DAY}`).expect(200),
    );
    expect(queue.entries.find((entry) => entry.orderId === orderId)?.transfer).toMatchObject({
      transferId,
      state: "planned",
      binCount: 3,
    });

    await receiveAtCounter(ctx, orderId, "Venu par le personnel").expect(204);
    await ctx.drain();
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "internal_transfer.received" },
      select: { payload: true },
    });
    expect(fact.payload).toMatchObject({ bins: 3 });
  });

  it("la base tient le sujet d'un bac : exactement un, et jamais une moitié de transfert", async () => {
    const { orderId, transferId } = await composedTransfer(ctx, DAY);
    const typeId = await binTypeId(ctx);
    const insert = (
      id: string,
      order: string | null,
      transfer: string | null,
      half: string | null,
    ) =>
      ctx.prisma.$executeRaw`
        INSERT INTO "delivery"."delivery_bin"
          ("id", "order_id", "transfer_id", "bin_type_id", "half", "physical_bin_id", "inner_bags", "code", "created_at")
        VALUES (${id}, ${order}, ${transfer}, ${typeId}, ${half}, ${half === null ? null : "p_x"}, 0, ${id.toUpperCase()}, now())`;

    await expect(insert("b00001", null, null, null)).rejects.toThrow(/delivery_bin_subject_check/u);
    await expect(insert("b00002", orderId, transferId, null)).rejects.toThrow(
      /delivery_bin_subject_check/u,
    );
    await expect(insert("b00003", null, transferId, "left")).rejects.toThrow(
      /delivery_bin_subject_check/u,
    );
  });
});

/** Lot T3, faille F4 : passée avant la clôture, la commande se remettait sans refus. */
describe("une commande d'un site servi par transfert, avant la clôture (F4)", () => {
  it("le comptoir la refuse : aucun transfert ne la porte encore", async () => {
    await seedVillageOrder(ctx, DAY, await seedVillage(ctx));

    const refusal = await handOverAtCounter(ctx).expect(409);

    expect(codeOf(refusal)).toBe("handover.transfer_not_yet_composed");
    expect(jsonBody<{ readonly message: string }>(refusal).message).toMatch(/Val Village/u);
  });
});
