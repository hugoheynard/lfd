/**
 * E2E de la **vie d'un reliquat après sa naissance** (lot B4, plan
 * `documentation/commandes/reliquat/reliquat.md`, § 6.5), sur
 * le vrai Postgres : l'abandonner (fait au journal, refus du second et d'un
 * transformé, droit requis), la liste « Reliquats à traiter » (ordre, filtre
 * par société, un reliquat fermé hors de `open`), les deux fiches — l'origine
 * montre son reliquat et la commande issue, la commande issue montre son
 * origine — et l'annulation de l'origine, qui abandonne le reliquat ouvert
 * et laisse un transformé.
 */
import type { AdminBackorderView, AdminOrderView } from "@lfd/contracts";

import { Backorder } from "../src/lafoliecoffee/orders/backorder/domain/entities/backorder.js";
import { BackorderRepository } from "../src/lafoliecoffee/orders/backorder/domain/ports/backorder.repository.js";
import { BackorderLine } from "../src/lafoliecoffee/orders/backorder/domain/value-objects/backorder-line.js";
import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  backorderDecor,
  conversionBody,
  convertBackorder,
  placeOrigin,
  SKU,
  staff,
  type BackorderDecor,
} from "./backorder-conversion-scene.js";
import { cardProvidersOverride } from "./card-payments.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const DAY = serviceDay(7);
const HOUR_MS = 3_600_000;
let ctx: E2eContext;
let decor: BackorderDecor;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, cardProvidersOverride("pi_reliquat_vie")],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  ctx.app.get(PricingMaterialsCache).invalidate();
  decor = await backorderDecor(ctx);
});

/** Une origine de 10 croissants au retrait, et son reliquat de 4, né il y a `hoursAgo` heures. */
async function originWithBackorder(
  owner: BackorderDecor = decor,
  hoursAgo = 1,
): Promise<{ originId: string; backorderId: string }> {
  const originId = await placeOrigin(ctx, owner, DAY, [{ sku: SKU, quantity: 10 }]);
  const backorderId = `bo_${originId}`;
  await ctx.app.get(BackorderRepository).save(
    Backorder.open({
      id: backorderId,
      originOrderId: originId,
      companyId: owner.companyId,
      buyerUserId: owner.buyerId,
      lines: [BackorderLine.of({ sku: SKU, quantity: 4, saleUnit: "piece" })],
      openedAt: new Date(Date.now() - hoursAgo * HOUR_MS),
    }),
  );
  return { originId, backorderId };
}

/** Une seconde société, active au compte, avec son acheteur : le décor partagé pour le reste. */
async function secondCompany(): Promise<BackorderDecor> {
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: "auth0|reliquat-bis" });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  return { ...decor, companyId: company.id, buyerId: user.id };
}

const abandon = (backorderId: string) =>
  staff(ctx).post(`/admin/backorders/${backorderId}/abandon`);

async function list(query: string): Promise<AdminBackorderView[]> {
  return jsonBody<AdminBackorderView[]>(
    await staff(ctx).get(`/admin/backorders${query}`).expect(200),
  );
}

async function detail(orderId: string): Promise<AdminOrderView> {
  return jsonBody<AdminOrderView>(await staff(ctx).get(`/admin/orders/${orderId}`).expect(200));
}

function stateOf(backorderId: string) {
  return ctx.prisma.backorder.findUniqueOrThrow({ where: { id: backorderId } });
}

function abandonedFactsOf(originId: string) {
  return ctx.prisma.activityEvent.findMany({
    where: { type: "backorder.abandoned", subjectId: originId },
  });
}

describe("abandonner un reliquat", () => {
  it("abandonné au nom de l'équipe, et le fait au journal", async () => {
    const { originId, backorderId } = await originWithBackorder();

    await abandon(backorderId).expect(204);

    expect(await stateOf(backorderId)).toMatchObject({
      state: "abandoned",
      closedByStaffId: E2E_STAFF_ID,
      convertedOrderId: null,
    });
    expect(await abandonedFactsOf(originId)).toHaveLength(1);
  });

  it("une seconde fois : refusé (409), un seul fait", async () => {
    const { originId, backorderId } = await originWithBackorder();
    await abandon(backorderId).expect(204);

    const refused = await abandon(backorderId).expect(409);

    expect(jsonBody<{ code: string }>(refused).code).toBe("orders.backorder.closed");
    expect(await abandonedFactsOf(originId)).toHaveLength(1);
  });

  it("transformé : refusé (409), le reliquat reste transformé", async () => {
    const { backorderId } = await originWithBackorder();
    const placed = await convertBackorder(ctx, backorderId, conversionBody(decor, DAY));

    await abandon(backorderId).expect(409);

    expect(await stateOf(backorderId)).toMatchObject({
      state: "converted",
      convertedOrderId: placed.id,
    });
  });

  it("sans le droit de la décision du départ : 403, rien d'écrit", async () => {
    const { backorderId } = await originWithBackorder();
    const key = "lecteur-commandes";
    await staff(ctx)
      .post("/admin/staff-roles")
      .send({ key, label: key, grants: [{ resource: "b2b_orders", action: "read" }] })
      .expect(201);
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: key,
        email: `${key}@lfc.test`,
        role: null,
        roleKey: key,
        status: "active",
        auth0Id: `staff-${key}`,
      },
    });

    await ctx.asSub(`staff-${key}`).post(`/admin/backorders/${backorderId}/abandon`).expect(403);

    expect((await stateOf(backorderId)).state).toBe("open");
  });
});

describe("la liste des reliquats", () => {
  it("les ouverts, du plus ancien au plus récent ; un fermé n'y est pas", async () => {
    const recent = await originWithBackorder(decor, 1);
    const old = await originWithBackorder(decor, 30);
    const other = await originWithBackorder(await secondCompany(), 5);
    const closed = await originWithBackorder(decor, 50);
    await abandon(closed.backorderId).expect(204);

    const open = await list("?state=open");

    expect(open.map((row) => row.id)).toEqual([
      old.backorderId,
      other.backorderId,
      recent.backorderId,
    ]);
    const originNumber = (await ctx.prisma.order.findUniqueOrThrow({ where: { id: old.originId } }))
      .orderNumber;
    expect(open[0]).toMatchObject({
      state: "open",
      origin: { orderId: old.originId, orderNumber: originNumber },
      company: { id: decor.companyId },
      buyer: { userId: decor.buyerId },
      lines: [{ sku: SKU, quantity: 4, saleUnit: "piece" }],
      convertedOrder: null,
      closedAt: null,
    });
    expect((await list("?state=abandoned")).map((row) => row.id)).toEqual([closed.backorderId]);
  });

  it("`open` par défaut, et filtrée par société", async () => {
    const mine = await originWithBackorder(decor, 2);
    const theirs = await secondCompany();
    const other = await originWithBackorder(theirs, 3);

    expect((await list("")).map((row) => row.id)).toEqual([other.backorderId, mine.backorderId]);
    expect((await list(`?companyId=${theirs.companyId}`)).map((row) => row.id)).toEqual([
      other.backorderId,
    ]);
  });

  it("un état inconnu est un refus de forme (400)", async () => {
    await staff(ctx).get("/admin/backorders?state=lost").expect(400);
  });
});

describe("les fiches de commande", () => {
  it("l'origine montre son reliquat transformé et la commande issue ; celle-ci montre son origine", async () => {
    const { originId, backorderId } = await originWithBackorder();
    const placed = await convertBackorder(ctx, backorderId, conversionBody(decor, DAY));
    const originNumber = (await ctx.prisma.order.findUniqueOrThrow({ where: { id: originId } }))
      .orderNumber;

    const origin = await detail(originId);
    expect(origin.backorder).toMatchObject({
      id: backorderId,
      state: "converted",
      convertedOrder: { orderId: placed.id, orderNumber: placed.orderNumber },
    });
    expect(origin.backorderOrigin).toBeNull();

    const issued = await detail(placed.id);
    expect(issued.backorder).toBeNull();
    expect(issued.backorderOrigin).toEqual({
      backorderId,
      origin: { orderId: originId, orderNumber: originNumber },
    });
  });

  it("une commande sans reliquat ne montre rien", async () => {
    const orderId = await placeOrigin(ctx, decor, DAY, [{ sku: SKU, quantity: 2 }]);

    const view = await detail(orderId);

    expect(view.backorder).toBeNull();
    expect(view.backorderOrigin).toBeNull();
  });
});

describe("l'annulation de la commande d'origine", () => {
  const cancel = (orderId: string) =>
    ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/orders/${orderId}/cancel`)
      .send({ reason: "Le client renonce à tout" });

  it("abandonne le reliquat ouvert, dans la même transaction, avec son fait", async () => {
    const { originId, backorderId } = await originWithBackorder();

    await cancel(originId).expect(204);

    expect(await stateOf(backorderId)).toMatchObject({
      state: "abandoned",
      closedByStaffId: E2E_STAFF_ID,
    });
    expect(await abandonedFactsOf(originId)).toHaveLength(1);
  });

  it("laisse un reliquat transformé : sa commande vit sa vie", async () => {
    const { originId, backorderId } = await originWithBackorder();
    const placed = await convertBackorder(ctx, backorderId, conversionBody(decor, DAY));

    await cancel(originId).expect(204);

    expect(await stateOf(backorderId)).toMatchObject({
      state: "converted",
      convertedOrderId: placed.id,
    });
    expect(await abandonedFactsOf(originId)).toEqual([]);
    const issued = await ctx.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect(issued.status).not.toBe("cancelled");
  });
});
