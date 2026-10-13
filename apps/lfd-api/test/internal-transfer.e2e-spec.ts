/**
 * E2E du **transfert interne** (lot T1 —
 * `documentation/livraisons/transferts/plan-transfert-interne.md`, §3 à §6).
 *
 * Ce que seul le vrai SQL prouve : qu'une vraie clôture du fournil range le
 * retrait du village dans son transfert (boîte d'envoi, abonné de la
 * livraison), que la composition le place dans une tournée par un arrêt de
 * genre `transfer` dont `order_id` est NUL, que le `CHECK` et l'index jumeau
 * tiennent en base, que le bac d'une commande du village se charge sur
 * l'arrêt du transfert, et que « Partir » fige le manifeste.
 *
 * Frontières doublées, en plus de la signature staff : la carte routière
 * (OSRM n'est pas lancé en e2e) et le trajet du transfert (T0).
 */
import type {
  DeliveryLoadingRoundView,
  DeliveryRoundsDayView,
  GpsPoint,
  InternalTransferManifestView,
} from "@lfd/contracts";

import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { declareBins, depart, loadBin, LOADING } from "./delivery-loading-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, admin, addVehicle, ROUNDS } from "./delivery-rounds-scene.js";
import { MEASURED, ROAD_ROUTING_OVERRIDES, seedDeparture } from "./delivery-routing-scene.js";
import { createUser } from "./factories.js";

const DAY = serviceDay();
const VILLAGE_GPS = { lat: 45.45, lng: 6.98 };

class FixedRoad extends RoadTravelTimeReader {
  minutesBetween(_from: GpsPoint, _to: GpsPoint): Promise<number | null> {
    return Promise.resolve(25);
  }
}

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

/** Val Village, servi par transfert, en mode dédié : aucune tournée de livraison à semer. */
async function seedVillage(): Promise<string> {
  const village = await ctx.prisma.site.create({
    data: {
      label: "Val Village",
      ligne1: "Route du Village",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      supply: "transfer",
      transferMode: "dedicated",
      counterSetupMinutes: 10,
      gps: VILLAGE_GPS,
      opening: { publicOpening: null, proPickup: { start: "07:30", end: "09:00" } },
    },
  });
  return village.id;
}

/**
 * Un retrait réglé au village pour le jour : trois pains. Écrit en Prisma,
 * comme les autres suites du fournil — le commerce n'a pas d'agrégat de ligne
 * hors d'une passation complète (dette de `test/factories.ts`).
 */
async function seedVillageOrder(siteId: string): Promise<string> {
  const user = await createUser(ctx.prisma, { auth0Sub: "auth0|client", email: "c@vv.fr" });
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: "CMD-VV-1",
      placedByUserId: user.id,
      clientele: "public",
      status: "placed",
      paymentStatus: "not_required",
      requestedDeliveryDate: new Date(`${DAY}T00:00:00.000Z`),
      fulfillmentMethod: "pickup",
      pickupAddress: {
        label: "Val Village",
        siteId,
        ligne1: "Route du Village",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
      },
      fulfillment: {
        window: { value: { start: "08:00", end: "10:00" }, source: "override" },
        contact: { value: null, source: "default" },
        signatureRequired: { value: false, source: "default" },
      },
      subtotalCents: 300,
      totalCents: 300,
      lines: {
        create: [
          {
            sku: "PAIN-VV",
            productNameSnapshot: "Pain du village",
            unitPriceMillicents: 100_000,
            quantity: 3,
            lineTotalCents: 300,
          },
        ],
      },
    },
  });
  return order.id;
}

async function closePlan(): Promise<void> {
  await admin(ctx).post(`/admin/production/batch/${DAY}/close`).expect(201);
  await ctx.drain();
}

async function composedTransfer(): Promise<{
  readonly orderId: string;
  readonly transferId: string;
}> {
  await seedDeparture(ctx);
  await addVehicle(ctx, "Kangoo", MEASURED);
  const orderId = await seedVillageOrder(await seedVillage());
  await closePlan();
  const transfer = await ctx.prisma.deliveryInternalTransfer.findFirstOrThrow({
    where: { serviceDay: DAY },
    select: { id: true },
  });
  return { orderId, transferId: transfer.id };
}

describe("le transfert interne, de la clôture au départ (lot T1)", () => {
  it("la clôture range le retrait dans un transfert, placé par UN arrêt `transfer` sans commande", async () => {
    const { orderId, transferId } = await composedTransfer();

    const items = await ctx.prisma.deliveryInternalTransferItem.findMany({
      select: { kind: true, orderId: true, refillId: true, transferId: true },
    });
    expect(items).toEqual([{ kind: "order", orderId, refillId: null, transferId }]);
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
    const { orderId, transferId } = await composedTransfer();
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

  it("le bac du village se charge sur l'arrêt du transfert ; « Partir » fige le manifeste", async () => {
    const { orderId, transferId } = await composedTransfer();
    const round = await ctx.prisma.deliveryRound.findFirstOrThrow({ select: { id: true } });

    const before = jsonBody<InternalTransferManifestView>(
      await admin(ctx).get(`/admin/delivery/transfers/${transferId}/manifest`).expect(200),
    );
    expect(before).toMatchObject({ frozen: false, siteLabel: "Val Village" });
    expect(before.totals).toEqual([
      { sku: "PAIN-VV", productName: "Pain du village", quantity: 3 },
    ]);

    const [binId] = await declareBins(ctx, orderId, 1);
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
