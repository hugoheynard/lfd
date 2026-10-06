/**
 * E2E de la **clientèle au poste de colisage** (demande de Hugo, 2026-10-06 :
 * un badge « Pro » ou « Public » après le nom du client).
 *
 * Ce qui ne se voit qu'ici : la clientèle traverse trois blocs — le commerce
 * la tranche, le fournil la fige à l'arrêt, le colisage la range depuis le
 * fait `production.packing_list_drawn` — et `GET admin/packing/:date/board`
 * la rend. Un fait écrit avant le champ (par l'ancien binaire) se lit
 * « inconnue », jamais refusé.
 */
import { randomUUID } from "node:crypto";

import type { ProductionPackingView } from "@lfd/contracts";
import { Prisma } from "../src/platform/database/client/client.js";

import { settleCardPayments } from "./card-payments.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  place,
  relayGate,
  releaseRelay,
} from "./production-day-fixture.js";

const DRAWN = "production.packing_list_drawn";
/** Un second client, rattaché à une société : ses commandes sont `pro`. */
const PRO_MEMBER = "auth0|pro-member";

let ctx: E2eContext;
let issued: string[];
let companyId: string;

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  relayGate.open = true;
  await ctx.reset();
  // `MEMBER` reste sans société : ses commandes sont publiques.
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const pro = await createUser(ctx.prisma, { auth0Sub: PRO_MEMBER });
  const company = await createCompany(ctx.prisma, { raisonSociale: "Hôtel du Col" });
  await attachTo(ctx.prisma, pro.id, company.id);
  companyId = company.id;
});

/** Une commande de retrait PAYÉE, passée pour la société du membre : `pro`. */
async function placeForCompany(quantity: number): Promise<void> {
  const point = await ctx.prisma.pickupAddress.findFirstOrThrow({ select: { id: true } });
  await ctx
    .asSub(PRO_MEMBER)
    .post(`/orders`)
    .send({
      idempotencyKey: randomUUID(),
      companyId,
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "pickup",
      pickupAddressId: point.id,
      note: "",
      lines: [{ sku: CROISSANT, quantity }],
    })
    .expect(201);
  await settleCardPayments(ctx, issued);
}

/** Une commande publique (sans société), puis une pro, sur la même journée. */
async function placeBoth(): Promise<{ readonly proId: string; readonly publicId: string }> {
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
  await placeForCompany(6);
  const orders = await ctx.prisma.order.findMany({ select: { id: true, companyId: true } });
  const pro = orders.find((order) => order.companyId !== null);
  const publicOrder = orders.find((order) => order.companyId === null);
  if (pro === undefined || publicOrder === undefined) {
    throw new Error("La journée devait porter une commande pro et une publique.");
  }
  return { proId: pro.id, publicId: publicOrder.id };
}

async function clienteleByOrder(): Promise<ReadonlyMap<string, string | null>> {
  const view = jsonBody<ProductionPackingView>(
    await ctx.asSub(STAFF).get(`/admin/packing/${SERVICE_DAY}/board`).expect(200),
  );
  return new Map(view.sheets.map((sheet) => [sheet.orderId, sheet.clientele]));
}

describe("GET admin/packing/:date/board — la clientèle de chaque commande", () => {
  it("rend `pro` et `public` après une clôture, figés aussi dans le plan du fournil", async () => {
    const { proId, publicId } = await placeBoth();
    await closePlan(ctx);
    await releaseRelay(ctx);

    const served = await clienteleByOrder();

    expect(served.get(proId)).toBe("pro");
    expect(served.get(publicId)).toBe("public");
    const frozen = await ctx.prisma.productionOrder.findMany({
      where: { serviceDay: SERVICE_DAY },
      select: { orderId: true, clientele: true },
    });
    expect(new Map(frozen.map((row) => [row.orderId, row.clientele]))).toEqual(
      new Map([
        [proId, "pro"],
        [publicId, "public"],
      ]),
    );
  });

  it("🔴 un fait écrit sans le champ (ancien binaire) se range et se lit « inconnue »", async () => {
    const { proId, publicId } = await placeBoth();
    relayGate.open = false;
    await closePlan(ctx);
    const facts = await ctx.prisma.outboxMessage.findMany({
      where: { type: DRAWN },
      select: { id: true, payload: true },
    });
    expect(facts).toHaveLength(2);
    for (const fact of facts) {
      await ctx.prisma.outboxMessage.update({
        where: { id: fact.id },
        data: { payload: withoutClientele(fact.payload) },
      });
    }
    await releaseRelay(ctx);

    const served = await clienteleByOrder();

    expect(served.get(proId)).toBeNull();
    expect(served.get(publicId)).toBeNull();
  });
});

/** Le payload tel que l'écrivait le binaire d'avant : sans `order.clientele`. */
function withoutClientele(payload: Prisma.JsonValue): Prisma.InputJsonValue {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Le fait « commande à coliser » devait être un objet.");
  }
  const order = payload["order"];
  if (typeof order !== "object" || order === null || Array.isArray(order)) {
    throw new Error("Le fait « commande à coliser » devait porter sa commande.");
  }
  const { clientele: _dropped, ...rest } = order;
  return { ...payload, order: rest };
}
