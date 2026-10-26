/**
 * E2E — **une commande prête compte** dans le chiffre d'affaires, les volumes
 * et l'historique d'alertes (décision de Hugo du 2026-10-26, plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, annexe F).
 *
 * Régression : les cinq listes de statuts « qui comptent » omettaient `ready`.
 * Une commande comptée la veille en `confirmed` disparaissait du CA, du cumul
 * d'un palier et de l'historique d'alertes le jour où elle était prête, et y
 * revenait une fois retirée.
 *
 * Chaque liste est éprouvée deux fois : prête, la commande compte ; retirée,
 * elle compte **une** fois, pas deux — le statut est une colonne, le passage
 * prête → retirée ne doit pas se lire comme un ajout.
 */
import type { CustomerSheetView } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";

import { AccountOrderHistoryReader } from "../src/b2b/alerts/domain/ports/order-history.reader.js";
import { revenueWhere } from "../src/b2b/growth/infrastructure/revenue.where.js";
import { MarkOrderFulfilledCommand } from "../src/b2b/orders/application/commands/mark-order-fulfilled.command.js";
import { MarkOrderReadyCommand } from "../src/b2b/orders/application/commands/mark-order-ready.command.js";
import { CustomerVolumeReader } from "../src/b2b/pricing/domain/ports/customer-volume.reader.js";
import { SkuVolumeReader } from "../src/b2b/pricing/domain/ports/sku-volume.reader.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, E2E_STAFF_ID, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";

const SKU = "VIE-001";
const UNITS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

interface Scene {
  readonly companyId: string;
  readonly orderNumber: string;
}

/** Une commande au compte, passée hier, de {@link UNITS} viennoiseries. */
async function seed(): Promise<Scene> {
  const owner = await createUser(ctx.prisma, { auth0Sub: "auth0|ready-counts" });
  const company = await createCompany(ctx.prisma, { status: "active" });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  const order = await placeOrder(ctx, {
    buyerUserId: owner.id,
    companyId: company.id,
    settlement: "account",
    placedAt: new Date(Date.now() - DAY_MS),
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: SKU, quantity: UNITS }],
  });
  return { companyId: company.id, orderNumber: order.orderNumber };
}

async function markReady(scene: Scene): Promise<void> {
  await ctx.app
    .get(CommandBus)
    .execute(new MarkOrderReadyCommand(scene.orderNumber, E2E_STAFF_ID, new Date()));
  await ctx.drain();
  const { status } = await ctx.prisma.order.findFirstOrThrow({
    where: { orderNumber: scene.orderNumber },
    select: { status: true },
  });
  expect(status).toBe("ready");
}

async function markFulfilled(scene: Scene): Promise<void> {
  await ctx.app
    .get(CommandBus)
    .execute(new MarkOrderFulfilledCommand(scene.orderNumber, E2E_STAFF_ID, new Date(), "manual"));
  await ctx.drain();
}

function window(): { readonly from: Date; readonly to: Date } {
  const now = Date.now();
  return { from: new Date(now - 30 * DAY_MS), to: new Date(now + DAY_MS) };
}

async function sheetOrders(companyId: string): Promise<number> {
  const response = await ctx
    .http()
    .set("Authorization", "Bearer staff-e2e")
    .get(`/admin/companies/${companyId}/customer-sheet`)
    .expect(200);
  return jsonBody<CustomerSheetView>(response).stats.ordersCount;
}

function revenueOrders(companyId: string): Promise<number> {
  return ctx.prisma.order.count({ where: { ...revenueWhere(), companyId } });
}

async function marketUnits(): Promise<number | undefined> {
  const volumes = await ctx.app.get(SkuVolumeReader).volumesFor([SKU], window());
  return volumes.get(SKU);
}

async function customerUnits(companyId: string): Promise<number | undefined> {
  const volumes = await ctx.app.get(CustomerVolumeReader).volumesFor(companyId, [SKU], window());
  return volumes.get(SKU);
}

async function alertHistory(companyId: string): Promise<number> {
  const history = await ctx.app.get(AccountOrderHistoryReader).read({
    companyId,
    evaluatedOrder: null,
    skus: [SKU],
    windowDays: 30,
    now: new Date(),
    maxOrdersPerSku: 10,
  });
  return history.previousOrderCount;
}

describe("une commande prête compte, et ne compte qu'une fois une fois retirée", () => {
  it("fiche client : nombre de commandes", async () => {
    const scene = await seed();
    await markReady(scene);
    expect(await sheetOrders(scene.companyId)).toBe(1);
    await markFulfilled(scene);
    expect(await sheetOrders(scene.companyId)).toBe(1);
  });

  it("chiffre d'affaires de la croissance (`revenue-scope`)", async () => {
    const scene = await seed();
    await markReady(scene);
    expect(await revenueOrders(scene.companyId)).toBe(1);
    await markFulfilled(scene);
    expect(await revenueOrders(scene.companyId)).toBe(1);
  });

  it("volume du marché (barème de volume)", async () => {
    const scene = await seed();
    await markReady(scene);
    expect(await marketUnits()).toBe(UNITS);
    await markFulfilled(scene);
    expect(await marketUnits()).toBe(UNITS);
  });

  it("volume du client (engagement)", async () => {
    const scene = await seed();
    await markReady(scene);
    expect(await customerUnits(scene.companyId)).toBe(UNITS);
    await markFulfilled(scene);
    expect(await customerUnits(scene.companyId)).toBe(UNITS);
  });

  it("historique des alertes", async () => {
    const scene = await seed();
    await markReady(scene);
    expect(await alertHistory(scene.companyId)).toBe(1);
    await markFulfilled(scene);
    expect(await alertHistory(scene.companyId)).toBe(1);
  });
});
