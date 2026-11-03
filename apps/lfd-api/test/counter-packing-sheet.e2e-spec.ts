/**
 * E2E de **la fiche de colis lue au comptoir** —
 * `GET /admin/counter/orders/:orderId/packing-sheet` (2026-11-03).
 *
 * Constaté ce jour-là sur le dev : le rail du comptoir lisait le poste entier
 * du colisage, sous un droit que le vendeur n'a pas ; il prenait un 403, ne
 * voyait aucune fiche, et proposait une remise complète sur un sac
 * incomplet. Ce qui ne se voit qu'ici : le vendeur qui n'a QUE
 * `handover_counter` lit la fiche (lignes, pièces au sac, bac fermé), reçoit
 * le « pas de fiche » nommé avant l'arrêt du plan, et un rôle sans le
 * comptoir est refusé.
 */
import type { CounterPackingSheetView } from "@lfd/contracts";
import type request from "supertest";

import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bagLines,
  bootstrapProductionDay,
  closeOrder,
  closePlan,
  place,
  recordBatch,
  sheetOf,
} from "./production-day-fixture.js";

/** Un ULID de forme valide, tiré « par l'écran ». */
const BATCH = "01K6A0000000000000000000C1";

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  // Le jeton porteur EST le `sub` : sans cela, la journée doublée ferait de
  // tout appelant le staff administrateur, et aucun refus ne se verrait.
  ({ ctx, issued } = await bootstrapProductionDay([ADMIN_VERIFIER_OVERRIDE]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

/** Un membre du staff dont le rôle, créé à l'écran, ne tient que `grants`. */
async function holderOf(
  key: string,
  grants: readonly { resource: string; action: string }[],
): Promise<request.Agent> {
  await ctx.asSub(STAFF).post("/admin/staff-roles").send({ key, label: key, grants }).expect(201);
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

function counterSeller(): Promise<request.Agent> {
  return holderOf("vendeur-comptoir", [{ resource: "handover_counter", action: "write" }]);
}

async function placedOrderId(): Promise<string> {
  const order = await ctx.prisma.order.findFirstOrThrow({ select: { id: true } });
  return order.id;
}

function path(orderId: string): string {
  return `/admin/counter/orders/${orderId}/packing-sheet`;
}

describe("GET admin/counter/orders/:orderId/packing-sheet", () => {
  it("rend au vendeur du comptoir la fiche d'une commande colisée", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
    await closePlan(ctx);
    await settle();
    expect(await recordBatch(ctx, BATCH, 4)).toBe(204);
    await settle();
    const orderId = await placedOrderId();
    const reference = (
      await ctx.prisma.packingOrder.findFirstOrThrow({ select: { reference: true } })
    ).reference;
    expect(await bagLines(ctx, await sheetOf(ctx, reference))).toBe(204);
    expect(await closeOrder(ctx, orderId)).toBe(204);
    await settle();
    const seller = await counterSeller();

    const sheet = jsonBody<CounterPackingSheetView>(await seller.get(path(orderId)).expect(200));

    expect(sheet).toMatchObject({
      orderId,
      reference,
      lineCount: 1,
      packedPieces: 4,
      lines: [{ sku: CROISSANT, quantity: 4, allocated: 4, awaitingProduction: false }],
    });
    expect(sheet.packedAt).not.toBeNull();
    // Le poste du colisage lui reste fermé.
    await seller.get(`/admin/packing/${SERVICE_DAY}/board`).expect(403);
  });

  it("dit « pas de fiche » sur une commande que le plan n'a pas tirée", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 2 }]);
    const seller = await counterSeller();

    const refused = await seller.get(path(await placedOrderId())).expect(404);

    expect(refused.body).toMatchObject({ code: "packing.counter.sheet_not_found" });
  });

  it("refuse un rôle qui n'a pas le comptoir", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 2 }]);
    const other = await holderOf("compta", [{ resource: "b2b_orders", action: "read" }]);

    await other.get(path(await placedOrderId())).expect(403);
  });
});
