/**
 * E2E du **transfert vu du livreur et du papier** (décisions de Hugo du
 * 2026-10-13, après les écrans du transfert —
 * `documentation/livraisons/transferts/plan-transfert-interne.md`).
 *
 * Ce que seul le vrai SQL prouve : qu'un livreur SANS `delivery_rounds:read`
 * lit le manifeste détaillé, les bacs et le lieu du site de SON transfert
 * sous le mur de « Ma tournée » (un autre livreur : 404) ; que l'adresse du
 * site vient du commerce par le canal ; que la feuille de route imprime
 * l'arrêt ; et qu'un rôle de chargement seul lit les formats de bac.
 */
import type { BinTypesView, MyDeliveryRoundView } from "@lfd/contracts";

import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { pdfPages } from "../src/platform/pdf/__tests__/pdf-text.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { MY_ROUND, seedDriverRole, staffWithRole } from "./delivery-driver-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, admin, ROUNDS, roundOf } from "./delivery-rounds-scene.js";
import { ROAD_ROUTING_OVERRIDES } from "./delivery-routing-scene.js";
import {
  composedTransfer,
  declareTransferBins,
  FixedRoad,
  VILLAGE_BREAD,
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
  await seedDriverRole(ctx);
});

/** Le transfert composé, deux bacs déclarés, et sa tournée confiée à Paul. */
async function drivenTransfer() {
  const { orderId, transferId } = await composedTransfer(ctx, DAY);
  const round = await ctx.prisma.deliveryRound.findFirstOrThrow({ select: { id: true } });
  await declareTransferBins(ctx, transferId, 2);
  const paul = await staffWithRole(ctx, "staff-paul");
  const { version } = await roundOf(ctx, DAY, round.id);
  await admin(ctx)
    .put(`${ROUNDS}/${round.id}/driver`)
    .send({ staffUserId: paul.id, version })
    .expect(204);
  return { orderId, transferId, roundId: round.id, paul };
}

describe("le transfert du livreur, sous le mur de « Ma tournée »", () => {
  it("le livreur lit le manifeste détaillé, les bacs et le lieu du site, sans lire les tournées", async () => {
    const { orderId, transferId, roundId, paul } = await drivenTransfer();

    // Le livreur n'a pas `delivery_rounds:read` : la route du manifeste lui est fermée.
    await paul.agent.get(`/admin/delivery/transfers/${transferId}/manifest`).expect(403);

    const view = jsonBody<MyDeliveryRoundView>(
      await paul.agent.get(`${MY_ROUND}/${roundId}`).expect(200),
    );
    const [stop] = view.transferStops ?? [];
    expect(stop).toMatchObject({
      transferId,
      binCount: 2,
      siteGps: { lat: 45.45, lng: 6.98 },
      resupplies: { items: [], totals: [] },
    });
    expect(stop?.siteAddress).toMatchObject({ ligne1: "Route du Village", codePostal: "73150" });
    expect(stop?.orders.items.map((item) => item.subjectId)).toEqual([orderId]);
    expect(stop?.orders.totals).toEqual([
      { sku: VILLAGE_BREAD.sku, productName: VILLAGE_BREAD.name, quantity: 3 },
    ]);
  });

  it("🔴 un autre livreur ne voit pas ce transfert : 404", async () => {
    const { roundId } = await drivenTransfer();
    const other = await staffWithRole(ctx, "staff-luc");

    await other.agent.get(`${MY_ROUND}/${roundId}`).expect(404);
  });
});

describe("la feuille de route imprime l'arrêt de transfert", () => {
  it("site, adresse, bacs, total des commandes", async () => {
    const { roundId } = await drivenTransfer();

    const response = await admin(ctx)
      .get(`${ROUNDS}/${roundId}/round.pdf`)
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const text = pdfPages(response.body as Buffer).join("\n");

    expect(text).toContain("Vers Val Village");
    expect(text).toContain("Route du Village");
    expect(text).toContain("2 bacs");
    expect(text).toContain("COMMANDES · 1 COMMANDE");
    expect(text).toContain(`3 × ${VILLAGE_BREAD.name}`);
  });
});

describe("les formats de bac, au chargement", () => {
  it("un rôle qui n'a que le chargement les lit, sans pouvoir en créer", async () => {
    const key = "chargement-seul";
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/staff-roles")
      .send({ key, label: key, grants: [{ resource: "delivery_loading", action: "read" }] })
      .expect(201);
    const loader = await staffWithRole(ctx, "staff-chargeur", key);

    jsonBody<BinTypesView>(await loader.agent.get("/admin/delivery/bins").expect(200));
    await loader.agent.post("/admin/delivery/bins").send({}).expect(403);
  });
});
