import type { AdminOrderView, AdminOrdersPage, AdminPlacedOrderResponse } from "@lfd/contracts";

import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

/**
 * E2E — **d'où vient la saisie de l'équipe** (Hugo, 2026-11-04 ; migration
 * `20261104100000_d_ou_vient_la_saisie`).
 *
 * Ce que seul ce niveau prouve : la colonne `orders.entry_origin` est écrite
 * par la passation de l'équipe (`counter` / `commercial`), laissée `NULL` par
 * celle du client, gardée par une révision, refusée par le CHECK sur une
 * commande du client ; et les deux vues du back-office la lisent — un
 * « Retrait immédiat » d'avant la colonne compris, lu `counter`.
 */

const BUYER = "auth0|acheteur-origine-saisie";
const DAY = serviceDay(7);

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

interface Scene {
  readonly companyId: string;
  readonly userId: string;
  readonly pickupId: string;
}

async function scene(): Promise<Scene> {
  const pickupId = await pickupSite(ctx.prisma);
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  return { companyId: company.id, userId: user.id, pickupId };
}

function content(pickupId: string, quantity: number): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001-1", quantity }],
  };
}

async function placeByStaff(s: Scene, origin: Record<string, unknown>): Promise<string> {
  const order = jsonBody<AdminPlacedOrderResponse>(
    await staff()
      .post("/admin/orders")
      .set(INTENT_KEY, freshIntent())
      .send({
        companyId: s.companyId,
        buyerUserId: s.userId,
        settlement: "account",
        ...origin,
        ...content(s.pickupId, 3),
      })
      .expect(201),
  );
  return order.id;
}

async function storedOrigin(orderId: string): Promise<string | null> {
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { entryOrigin: true },
  });
  return row.entryOrigin;
}

async function detailOrigin(orderId: string): Promise<AdminOrderView["entryOrigin"]> {
  const view = jsonBody<AdminOrderView>(await staff().get(`/admin/orders/${orderId}`).expect(200));
  return view.entryOrigin;
}

async function listOrigin(orderId: string): Promise<AdminOrderView["entryOrigin"] | undefined> {
  const page = jsonBody<AdminOrdersPage>(await staff().get("/admin/orders").expect(200));
  return page.rows.find((row) => row.id === orderId)?.entryOrigin;
}

describe("orders.entry_origin — la passation la garde, le back-office la lit", () => {
  it("une saisie du commercial (aucune origine envoyée) : `commercial`", async () => {
    const orderId = await placeByStaff(await scene(), {});

    expect(await storedOrigin(orderId)).toBe("commercial");
    expect(await detailOrigin(orderId)).toBe("commercial");
    expect(await listOrigin(orderId)).toBe("commercial");
  });

  it("une saisie au comptoir : `counter`", async () => {
    const orderId = await placeByStaff(await scene(), { entryOrigin: "counter" });

    expect(await storedOrigin(orderId)).toBe("counter");
    expect(await detailOrigin(orderId)).toBe("counter");
    expect(await listOrigin(orderId)).toBe("counter");
  });

  it("une commande du client lui-même : `NULL`, et le CHECK refuse d'y poser une origine", async () => {
    const s = await scene();
    const placed = await placeOrder(ctx, {
      buyerUserId: s.userId,
      companyId: s.companyId,
      settlement: "account",
      forDay: DAY,
      fulfillment: { method: "pickup", pickupSiteId: s.pickupId },
    });

    expect(await storedOrigin(placed.id)).toBeNull();
    expect(await detailOrigin(placed.id)).toBeNull();
    await expect(
      ctx.prisma.order.update({ where: { id: placed.id }, data: { entryOrigin: "counter" } }),
    ).rejects.toThrow(/orders_entry_origin_by_staff/u);
  });

  it("une révision garde l'origine telle quelle", async () => {
    const s = await scene();
    const orderId = await placeByStaff(s, { entryOrigin: "counter" });

    await staff()
      .post(`/admin/orders/${orderId}/revisions`)
      .send({ expectedRevision: 0, ...content(s.pickupId, 5) })
      .expect(200);

    expect(await storedOrigin(orderId)).toBe("counter");
  });

  it("une saisie d'avant la colonne : `null` ; un « Retrait immédiat » d'avant se lit `counter`", async () => {
    const s = await scene();
    const orderId = await placeByStaff(s, {});
    // L'état d'une commande passée avant la migration : aucune origine gardée.
    await ctx.prisma.order.update({ where: { id: orderId }, data: { entryOrigin: null } });

    expect(await detailOrigin(orderId)).toBeNull();

    await ctx.prisma.order.update({
      where: { id: orderId },
      data: { supply: "shelf", entryShortcut: "immediate_pickup" },
    });

    expect(await detailOrigin(orderId)).toBe("counter");
    expect(await listOrigin(orderId)).toBe("counter");
  });
});
