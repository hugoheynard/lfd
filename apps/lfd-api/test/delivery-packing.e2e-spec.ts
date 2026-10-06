/**
 * **Le colisage proposé** et les moitiés libres (plan de tournée, lot 4 bis,
 * L4b-C4, v2-3, v2-4, tranche C) — sur le vrai Postgres : les lignes lues par
 * le canal commerce, le froid du miroir du catalogue, les contenances de la
 * grille, la place de la commande dans sa tournée, et le droit relu en base.
 * Proposer n'écrit rien : aucun bac n'est déclaré par ces routes.
 */
import type {
  CreatedIdResponse,
  DeliveryBinFreeHalvesView,
  DeliveryPackingProposalView,
  StaffRole,
} from "@lfd/contracts";

import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  ADMIN_VERIFIER_OVERRIDE,
  addVehicle,
  admin,
  assign,
  forgetCustomer,
  openRound,
  seedDelivery,
} from "./delivery-rounds-scene.js";
import { BINS, binTypeId, declareTypedBins, depart, LOADING } from "./delivery-loading-scene.js";

const DAY = serviceDay();
const PROPOSAL = `${LOADING}/colisage/proposition`;
const PARTNERS = `${BINS}/partenaires`;

/** Deux produits du semis du catalogue : un sec, un qu'on déclare froid. */
const CROISSANT = "VIE-001";
const TARTE = "VIE-011";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
});

/**
 * Pose des lignes sur une commande semée. Écrit en Prisma, comme la commande
 * elle-même (`seedDelivery`) : le commerce n'a pas d'agrégat de ligne à qui le
 * demander hors d'une passation complète — dette de `test/factories.ts`.
 */
async function withLines(
  orderId: string,
  lines: readonly { readonly sku: string; readonly quantity: number }[],
): Promise<void> {
  await ctx.prisma.orderLine.createMany({
    data: lines.map(({ sku, quantity }) => ({
      orderId,
      sku,
      productNameSnapshot: `Produit ${sku}`,
      unitPriceMillicents: 100_000,
      quantity,
      lineTotalCents: quantity * 100,
    })),
  });
}

async function setCapacity(binType: string, sku: string, units: number): Promise<void> {
  await admin(ctx)
    .put(`${LOADING}/contenances`)
    .send({ binTypeId: binType, sku, units })
    .expect(204);
}

async function isothermType(): Promise<string> {
  const response = await admin(ctx)
    .post(`${LOADING}/bacs`)
    .send({
      name: "Bac S isotherme e2e",
      outer: { lengthMm: 400, widthMm: 300, heightMm: 200 },
      inner: { lengthMm: 360, widthMm: 260, heightMm: 160 },
      isotherm: true,
      maxStack: 5,
      divisible: false,
    })
    .expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

async function proposalOf(orderId: string): Promise<DeliveryPackingProposalView> {
  return jsonBody<DeliveryPackingProposalView>(
    await admin(ctx).get(`${PROPOSAL}?commande=${orderId}`).expect(200),
  );
}

/** Une tournée de trois arrêts, dans l'ordre. */
async function threeStops() {
  const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
  const orders = [
    await seedDelivery(ctx, DAY),
    await seedDelivery(ctx, DAY),
    await seedDelivery(ctx, DAY),
  ] as const;
  for (const order of orders) {
    await assign(ctx, DAY, roundId, order.id);
  }
  return { roundId, orders };
}

describe("GET colisage/proposition", () => {
  it("colise le froid en isotherme, le sec à part, et signale ce qui n'a pas de contenance", async () => {
    const order = await seedDelivery(ctx, DAY);
    const bacM = await binTypeId(ctx);
    const bacS = await isothermType();
    await setCapacity(bacM, CROISSANT, 24);
    await setCapacity(bacS, TARTE, 4);
    // Le froid est un fait de la fiche, relayé par le miroir du catalogue.
    await ctx.prisma.catalogItem.updateMany({
      where: { productSku: TARTE },
      data: { requiresCold: true },
    });
    await withLines(order.id, [
      { sku: CROISSANT, quantity: 30 },
      { sku: TARTE, quantity: 2 },
      { sku: "PAI-001", quantity: 5 },
    ]);

    const view = await proposalOf(order.id);

    expect(view.reference).toBe(order.reference);
    expect(view.lines.find((line) => line.sku === TARTE)?.requiresCold).toBe(true);
    expect(
      view.bins.map(({ binTypeId: type, whole, half, cold }) => ({ type, whole, half, cold })),
    ).toEqual([
      { type: bacS, whole: 1, half: false, cold: true },
      // 30 croissants à 24 par bac : un bac plein, et 6 (0,25) en demi-bac.
      { type: bacM, whole: 1, half: true, cold: false },
    ]);
    expect(view.unplaced).toEqual([
      { sku: "PAI-001", name: "Produit PAI-001", quantity: 5, reason: "no_capacity" },
    ]);
    expect(view.shareCandidate).toBeNull();
    // Une lecture : rien de déclaré.
    expect(await ctx.prisma.deliveryBin.count()).toBe(0);
  });

  it("propose la moitié libre de l'arrêt voisin, et plus rien une fois la tournée partie", async () => {
    const { roundId, orders } = await threeStops();
    const bacM = await binTypeId(ctx);
    await setCapacity(bacM, CROISSANT, 24);
    const [partnerBinId] = await declareTypedBins(ctx, {
      orderId: orders[0].id,
      whole: 0,
      half: true,
      innerBags: 0,
    });
    await withLines(orders[1].id, [{ sku: CROISSANT, quantity: 10 }]);

    expect((await proposalOf(orders[1].id)).shareCandidate).toEqual({
      partnerOrderId: orders[0].id,
      partnerReference: orders[0].reference,
      partnerBinId,
      binTypeId: bacM,
      binTypeName: "Bac M e2e",
      replacesBinIndex: 0,
    });
    // L'arrêt 3 n'est pas voisin de l'arrêt 1 : rien pour lui.
    await withLines(orders[2].id, [{ sku: CROISSANT, quantity: 10 }]);
    expect((await proposalOf(orders[2].id)).shareCandidate).toBeNull();

    // Chaque arrêt porte un bac, puis la tournée part.
    await declareTypedBins(ctx, { orderId: orders[1].id, whole: 1, half: false, innerBags: 0 });
    await declareTypedBins(ctx, { orderId: orders[2].id, whole: 1, half: false, innerBags: 0 });
    for (const orderId of orders.map((order) => order.id)) {
      const { bins } = jsonBody<{ bins: { binId: string }[] }>(
        await admin(ctx).get(`${BINS}?commande=${orderId}`).expect(200),
      );
      for (const bin of bins) {
        await admin(ctx)
          .post(`${LOADING}/chargement/${roundId}/bacs`)
          .send({ binId: bin.binId })
          .expect(204);
      }
    }
    expect((await depart(ctx, roundId)).status).toBe(204);
    expect((await proposalOf(orders[1].id)).shareCandidate).toBeNull();
  });

  it("refuse une commande inconnue (409), comme la déclaration", async () => {
    await admin(ctx).get(`${PROPOSAL}?commande=inconnue`).expect(409);
    await admin(ctx).get(PROPOSAL).expect(400);
  });
});

describe("GET colisage/bacs/partenaires", () => {
  it("rend la place de la commande et les moitiés libres de ses voisins", async () => {
    const { roundId, orders } = await threeStops();
    const [left] = await declareTypedBins(ctx, {
      orderId: orders[0].id,
      whole: 0,
      half: true,
      innerBags: 0,
    });
    const [right] = await declareTypedBins(ctx, {
      orderId: orders[2].id,
      whole: 0,
      half: true,
      innerBags: 0,
    });

    const view = jsonBody<DeliveryBinFreeHalvesView>(
      await admin(ctx).get(`${PARTNERS}?commande=${orders[1].id}`).expect(200),
    );

    expect(view.round).toMatchObject({ roundId, day: DAY, departedAt: null });
    expect(view.halves.map((half) => [half.binId, half.reference, half.freeHalf])).toEqual([
      [left, orders[0].reference, "right"],
      [right, orders[2].reference, "right"],
    ]);

    // Partagée, la moitié n'est plus libre.
    await admin(ctx)
      .post(`${BINS}/partage`)
      .send({ orderId: orders[1].id, partnerBinId: left, innerBags: 0 })
      .expect(201);
    const after = jsonBody<DeliveryBinFreeHalvesView>(
      await admin(ctx).get(`${PARTNERS}?commande=${orders[1].id}`).expect(200),
    );
    expect(after.halves.map((half) => half.binId)).toEqual([right]);
  });

  it("hors de toute tournée : aucune tournée, aucune moitié", async () => {
    const order = await seedDelivery(ctx, DAY);

    const view = jsonBody<DeliveryBinFreeHalvesView>(
      await admin(ctx).get(`${PARTNERS}?commande=${order.id}`).expect(200),
    );

    expect(view).toEqual({
      orderId: order.id,
      reference: order.reference,
      round: null,
      halves: [],
    });
  });
});

describe("le droit `delivery_loading`", () => {
  async function asRole(role: StaffRole): Promise<ReturnType<E2eContext["asSub"]>> {
    const sub = `staff-${role}`;
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: role,
        email: `${role}@lfc.test`,
        role,
        status: "active",
        auth0Id: sub,
      },
    });
    return ctx.asSub(sub);
  }

  it("le support ne lit ni la proposition ni les moitiés libres (403)", async () => {
    const order = await seedDelivery(ctx, DAY);
    const support = await asRole("support");

    await support.get(`${PROPOSAL}?commande=${order.id}`).expect(403);
    await support.get(`${PARTNERS}?commande=${order.id}`).expect(403);
  });
});
