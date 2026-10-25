/**
 * E2E des **étiquettes de bacs en PDF A6** (2026-10-25, Hugo : « imprimer
 * l'étiquette devrait donner un beau PDF, là on est sur une capture
 * d'écran »).
 *
 * Ce qui ne se voit qu'ici : les bacs lus dans leurs vraies tables, la
 * tournée et le rang d'arrêt imprimés, la couleur lue au commerce par le fil
 * de `appBootstrap`, les droits de la garde — le panneau du geste pour une
 * commande, la lecture du chargement pour un transfert — et qu'imprimer
 * n'écrit rien.
 */
import { Buffer } from "node:buffer";

import type { RoleGrant } from "@lfd/contracts";
import type request from "supertest";

import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { pdfPages } from "../src/platform/pdf/__tests__/pdf-text.js";
import { bootstrapE2e, E2E_STAFF_SUB, serviceDay, type E2eContext } from "./e2e-harness.js";
import { atTheDesk, composedOrder, declareBins } from "./delivery-loading-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, admin, forgetCustomer } from "./delivery-rounds-scene.js";
import { ROAD_ROUTING_OVERRIDES } from "./delivery-routing-scene.js";
import { composedTransfer, declareTransferBins, FixedRoad } from "./internal-transfer-scene.js";

const DAY = serviceDay();
const LABELS = "/admin/delivery/packing/bin-labels";

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
  forgetCustomer();
});

/** Le corps brut : supertest ne parse pas un PDF tout seul. */
function pdfOf(test: request.Test): request.Test {
  return test.buffer(true).parse((res, callback) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => {
      callback(null, Buffer.concat(chunks));
    });
  });
}

function pagesOf(response: request.Response): readonly string[] {
  const body: unknown = response.body;
  if (!(body instanceof Uint8Array)) {
    throw new TypeError("le corps servi n'est pas binaire");
  }
  return pdfPages(Buffer.from(body));
}

/** Un rôle créé à l'écran, qui ne tient que ces droits, et une personne qui le porte. */
async function holderOf(key: string, grants: readonly RoleGrant[]): Promise<request.Agent> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/staff-roles")
    .send({ key, label: key, grants })
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

describe("les étiquettes des bacs d'une commande", () => {
  it("une feuille par bac vivant : la tournée, l'arrêt, la référence, le code", async () => {
    const { order } = await composedOrder(ctx, DAY, "Kangoo blanc");
    const [first, second] = await declareBins(ctx, order.id, 2);
    const codes = await ctx.prisma.deliveryBin.findMany({
      where: { id: { in: [first ?? "", second ?? ""] } },
      select: { code: true },
    });

    const response = await pdfOf(admin(ctx).get(`${LABELS}?order=${order.id}`)).expect(200);

    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("inline");
    const pages = pagesOf(response);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("Kangoo blanc");
    expect(pages[0]).toContain("Arrêt 1");
    expect(pages[0]).toContain(order.reference);
    for (const { code } of codes) {
      expect(pages.join(" ")).toContain(code);
    }
  });

  it("`?bacs=` n'imprime que ce bac ; un bac annulé n'a plus d'étiquette ; rien ne s'écrit", async () => {
    const { order } = await composedOrder(ctx, DAY, "Kangoo blanc");
    const [first, second] = await declareBins(ctx, order.id, 2);
    await atTheDesk(ctx, (desk) => desk.voidBin(first ?? ""));
    const before = await ctx.prisma.deliveryBin.count();

    const one = await pdfOf(
      admin(ctx).get(`${LABELS}?order=${order.id}&bacs=${second ?? ""}`),
    ).expect(200);
    expect(pagesOf(one)).toHaveLength(1);

    const voided = await admin(ctx).get(`${LABELS}?order=${order.id}&bacs=${first ?? ""}`);
    expect(voided.status).toBe(404);
    expect((voided.body as { code?: unknown }).code).toBe("delivery.bin_labels.nothing_to_print");
    expect(await ctx.prisma.deliveryBin.count()).toBe(before);
  });

  it("se lit au panneau du geste : écrire le colisage l'ouvre, le lire ne l'ouvre pas", async () => {
    const { order } = await composedOrder(ctx, DAY, "Kangoo blanc");
    await declareBins(ctx, order.id, 1);
    const writer = await holderOf("colis-ecrit", [
      { resource: "production_packing", action: "write" },
    ]);
    const reader = await holderOf("colis-lit", [
      { resource: "production_packing", action: "read" },
    ]);

    await pdfOf(writer.get(`${LABELS}?order=${order.id}`)).expect(200);
    await reader.get(`${LABELS}?order=${order.id}`).expect(403);
  });

  it("refuse une adresse sans commande (400)", async () => {
    await admin(ctx).get(LABELS).expect(400);
  });
});

describe("les étiquettes des bacs d'un transfert interne", () => {
  it("titrées « Transfert <site> », une feuille par bac", async () => {
    const { transferId } = await composedTransfer(ctx, DAY);
    await declareTransferBins(ctx, transferId, 2);

    const response = await pdfOf(admin(ctx).get(`${LABELS}/transfers/${transferId}`)).expect(200);

    const pages = pagesOf(response);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("Transfert Val Village");
    expect(pages[1]).toContain("Bac 2/2");
  });

  it("un transfert inconnu : 404", async () => {
    await admin(ctx).get(`${LABELS}/transfers/tr_inconnu`).expect(404);
  });
});
