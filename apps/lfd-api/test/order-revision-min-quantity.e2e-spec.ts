import type { AdminPlacedOrderResponse } from "@lfd/contracts";

import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { pickupSite } from "./order-factory.js";

/**
 * E2E — **le minimum d'une ligne GARDÉE qu'on change en révision staff**
 * (dérogation à R3 décidée par Hugo le 2026-10-29,
 * `documentation/catalogue/plan-quantite-minimale.md`, M4).
 *
 * Ce que seul ce niveau prouve : le minimum relu pour une ligne gardée est
 * celui que `catalog_items` porte AUJOURD'HUI pour la clientèle de la commande,
 * et un article retiré depuis (`withdrawn_at`) n'en a plus. La commande est
 * passée sans minimum ; le minimum est posé ensuite.
 */

const BUYER = "auth0|acheteur-revision-minimum";
const DAY = serviceDay(7);
const PRO_MINIMUM = 6;
const ORDERED = 10;
const BELOW_MINIMUM = "orders.line.quantity_below_minimum";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

function content(pickupId: string, lines: readonly object[]): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines,
  };
}

/** Une commande pro au compte de 10 croissants, saisie par l'équipe AVANT tout minimum. */
async function placed(): Promise<{ readonly orderId: string; readonly pickupId: string }> {
  const pickupId = await pickupSite(ctx.prisma);
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  const order = jsonBody<AdminPlacedOrderResponse>(
    await staff()
      .post("/admin/orders")
      .send({
        companyId: company.id,
        buyerUserId: user.id,
        settlement: "account",
        ...content(pickupId, [{ sku: "VIE-001", quantity: ORDERED }]),
      })
      .expect(201),
  );
  return { orderId: order.id, pickupId };
}

/** Le croissant, tel que le fil v15 le projette sur la déclinaison par défaut. */
function setCroissant(data: {
  readonly proMinQuantity?: number;
  readonly withdrawnAt?: string;
}): Promise<unknown> {
  return ctx.prisma.catalogItem.update({ where: { sku: "VIE-001-1" }, data });
}

function revise(orderId: string, pickupId: string, lines: readonly object[]) {
  return staff()
    .post(`/admin/orders/${orderId}/revisions`)
    .send({ expectedRevision: 0, ...content(pickupId, lines) });
}

async function croissants(orderId: string): Promise<number | undefined> {
  const line = await ctx.prisma.orderLine.findFirst({
    where: { orderId, sku: "VIE-001" },
    select: { quantity: true },
  });
  return line?.quantity;
}

describe("POST /admin/orders/:id/revisions — le minimum d'une ligne gardée", () => {
  it("une ligne gardée baissée sous le minimum : 409, la commande reste intacte", async () => {
    const { orderId, pickupId } = await placed();
    await setCroissant({ proMinQuantity: PRO_MINIMUM });

    const response = await revise(orderId, pickupId, [
      { sku: "VIE-001", quantity: PRO_MINIMUM - 1 },
    ]);

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe(BELOW_MINIMUM);
    expect(await croissants(orderId)).toBe(ORDERED);
  });

  it("une ligne gardée baissée jusqu'au minimum : la révision passe", async () => {
    const { orderId, pickupId } = await placed();
    await setCroissant({ proMinQuantity: PRO_MINIMUM });

    await revise(orderId, pickupId, [{ sku: "VIE-001", quantity: PRO_MINIMUM }]).expect(200);

    expect(await croissants(orderId)).toBe(PRO_MINIMUM);
  });

  it("une ligne gardée inchangée sous un minimum posé après coup : les autres lignes se révisent", async () => {
    const { orderId, pickupId } = await placed();
    await setCroissant({ proMinQuantity: ORDERED + 2 });

    await revise(orderId, pickupId, [
      { sku: "VIE-001", quantity: ORDERED },
      { sku: "VIE-002", quantity: 1 },
    ]).expect(200);

    expect(await croissants(orderId)).toBe(ORDERED);
  });

  it("une ligne gardée dont l'article est sorti du catalogue : aucun minimum connu, elle passe", async () => {
    const { orderId, pickupId } = await placed();
    await setCroissant({ proMinQuantity: PRO_MINIMUM, withdrawnAt: daysAgo(1) });

    await revise(orderId, pickupId, [{ sku: "VIE-001", quantity: 1 }]).expect(200);

    expect(await croissants(orderId)).toBe(1);
  });
});
