/**
 * E2E du **transfert interne** (lot T1 —
 * `documentation/livraisons/transferts/plan-transfert-interne.md`, §3 à §6).
 *
 * Ce que seul le vrai SQL prouve : qu'une vraie clôture du fournil range le
 * retrait du village dans son transfert (boîte d'envoi, abonné de la
 * livraison), que la composition le place dans une tournée par un arrêt de
 * genre `transfer` dont `order_id` est NUL, que le `CHECK` et l'index jumeau
 * tiennent en base, que les bacs du TRANSFERT se déclarent et se chargent
 * sur son arrêt (lot T3, Q-T4 révisée), et que « Partir » fige le manifeste.
 *
 * Frontières doublées, en plus de la signature staff : la carte routière
 * (OSRM n'est pas lancé en e2e) et le trajet du transfert (T0).
 */
import type {
  DeliveryLoadingRoundView,
  DeliveryRoundsDayView,
  InternalTransferManifestView,
} from "@lfd/contracts";

import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { depart, loadBin, LOADING } from "./delivery-loading-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, admin, ROUNDS } from "./delivery-rounds-scene.js";
import { ROAD_ROUTING_OVERRIDES } from "./delivery-routing-scene.js";
import {
  codeOf,
  composedTransfer,
  declareTransferBins,
  FixedRoad,
  handOverAtCounter,
  receiveAtCounter,
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

describe("le transfert interne, de la clôture au départ (lot T1)", () => {
  it("la clôture range le retrait dans un transfert, placé par UN arrêt `transfer` sans commande", async () => {
    const { orderId, transferId } = await composedTransfer(ctx, DAY);

    const items = await ctx.prisma.deliveryInternalTransferItem.findMany({
      select: { kind: true, orderId: true, resupplyId: true, transferId: true },
    });
    expect(items).toEqual([{ kind: "order", orderId, resupplyId: null, transferId }]);
    const stops = await ctx.prisma.deliveryRoundStop.findMany({
      select: { kind: true, orderId: true, transferId: true },
    });
    expect(stops).toEqual([{ kind: "transfer", orderId: null, transferId }]);

    const view = jsonBody<DeliveryRoundsDayView>(
      await admin(ctx).get(`${ROUNDS}?day=${DAY}`).expect(200),
    );
    expect(view.rounds).toHaveLength(1);
    expect(view.rounds[0]?.stops).toEqual([]);
    expect(view.rounds[0]?.transferStops).toEqual([
      expect.objectContaining({ transferId, siteLabel: "Val Village", position: 1, orderCount: 1 }),
    ]);
    // Le retrait du village n'est jamais « à répartir » : ce n'est pas une livraison.
    expect(view.unassigned).toEqual([]);
  });

  it("la base tient le genre d'arrêt : CHECK, et un transfert dans au plus une tournée vivante", async () => {
    const { orderId, transferId } = await composedTransfer(ctx, DAY);
    const round = await ctx.prisma.deliveryRound.findFirstOrThrow({ select: { id: true } });

    await expect(
      ctx.prisma.$executeRaw`
        INSERT INTO "delivery"."delivery_round_stop"
          ("id", "round_id", "kind", "order_id", "transfer_id", "service_day", "position", "created_at")
        VALUES ('s_bad', ${round.id}, 'transfer', ${orderId}, ${transferId}, ${DAY}, 9, now())`,
    ).rejects.toThrow(/delivery_round_stop_kind_check/u);
    await expect(
      ctx.prisma.$executeRaw`
        INSERT INTO "delivery"."delivery_round_stop"
          ("id", "round_id", "kind", "transfer_id", "service_day", "position", "created_at")
        VALUES ('s_twin', ${round.id}, 'transfer', ${transferId}, ${DAY}, 9, now())`,
    ).rejects.toThrow(/delivery_round_stop_live_transfer_key/u);
  });

  it("le bac du transfert se charge sur son arrêt ; « Partir » fige le manifeste", async () => {
    const { transferId } = await composedTransfer(ctx, DAY);
    const round = await ctx.prisma.deliveryRound.findFirstOrThrow({ select: { id: true } });

    const before = jsonBody<InternalTransferManifestView>(
      await admin(ctx).get(`/admin/delivery/transfers/${transferId}/manifest`).expect(200),
    );
    expect(before).toMatchObject({ frozen: false, siteLabel: "Val Village" });
    expect(before.totals).toEqual([
      { sku: "PAIN-VV", productName: "Pain du village", quantity: 3 },
    ]);

    const [binId] = await declareTransferBins(ctx, transferId, 1);
    await loadBin(ctx, round.id, { binId: binId ?? "" }).expect(204);
    const loading = jsonBody<DeliveryLoadingRoundView>(
      await admin(ctx).get(`${LOADING}/loading/${round.id}`).expect(200),
    );
    expect(loading.transferStops?.[0]).toMatchObject({ transferId, state: "loaded" });

    expect((await depart(ctx, round.id)).status).toBe(204);

    const after = jsonBody<InternalTransferManifestView>(
      await admin(ctx).get(`/admin/delivery/transfers/${transferId}/manifest`).expect(200),
    );
    expect(after.frozen).toBe(true);
    expect(after.totals).toEqual(before.totals);
    expect(
      await ctx.prisma.deliveryInternalTransferManifestLine.count({ where: { transferId } }),
    ).toBe(1);
  });
});

describe("la réception au site et le refus au comptoir (lot T2)", () => {
  it("le comptoir refuse une commande dont le transfert n'est pas reçu, en nommant le geste de sortie", async () => {
    await composedTransfer(ctx, DAY);

    const refusal = await handOverAtCounter(ctx).expect(409);

    expect(codeOf(refusal)).toBe("handover.transfer_not_received");
    expect(jsonBody<{ readonly message: string }>(refusal).message).toMatch(/Réceptionner/u);
  });

  it("réception manuelle (aucune tournée partie) : motif exigé, un seul gagnant, puis la remise n'est plus refusée pour le transfert", async () => {
    const { orderId, transferId } = await composedTransfer(ctx, DAY);

    const noReason = await receiveAtCounter(ctx, orderId, null).expect(400);
    expect(codeOf(noReason)).toBe("delivery.internal_transfer_reception_reason_required");
    await receiveAtCounter(ctx, orderId, "Venu par le personnel").expect(204);
    const twice = await receiveAtCounter(ctx, orderId, "Encore").expect(409);
    expect(codeOf(twice)).toBe("delivery.internal_transfer_already_received");

    const row = await ctx.prisma.deliveryInternalTransfer.findUniqueOrThrow({
      where: { id: transferId },
      select: { receivedAt: true, receivedReason: true, departedAt: true },
    });
    expect(row).toMatchObject({ receivedReason: "Venu par le personnel", departedAt: null });
    expect(row.receivedAt).not.toBeNull();
    const after = await handOverAtCounter(ctx);
    expect(after.status === 409 ? codeOf(after) : "").not.toBe("handover.transfer_not_received");
  });

  it("la base refuse une réception sans auteur (CHECK)", async () => {
    const { transferId } = await composedTransfer(ctx, DAY);

    await expect(
      ctx.prisma.$executeRaw`
        UPDATE "delivery"."delivery_internal_transfer"
           SET "received_at" = now() WHERE "id" = ${transferId}`,
    ).rejects.toThrow(/delivery_internal_transfer_received_check/u);
  });

  it("une commande sortie d'un transfert peut entrer dans un autre : l'unicité ne tient que les éléments portés", async () => {
    const { orderId, transferId } = await composedTransfer(ctx, DAY);
    await ctx.prisma.deliveryInternalTransferItem.updateMany({
      where: { transferId },
      data: { detachedAt: new Date() },
    });
    const other = await ctx.prisma.deliveryInternalTransfer.create({
      data: {
        id: "t_other",
        serviceDay: DAY,
        siteId: "s",
        siteLabel: "Val Village",
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await ctx.prisma.deliveryInternalTransferItem.create({
      data: {
        id: "i_other",
        transferId: other.id,
        kind: "order",
        orderId,
        attachedAt: new Date(),
      },
    });
    await expect(
      ctx.prisma.deliveryInternalTransferItem.create({
        data: { id: "i_dup", transferId: other.id, kind: "order", orderId, attachedAt: new Date() },
      }),
    ).rejects.toThrow();
  });
});
