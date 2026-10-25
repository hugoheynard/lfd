/**
 * **La scène du départ incomplet** — une commande au compte tirée au colisage,
 * son manque signalé, sa décision. Partagée par la décision (E6b + E6c1,
 * `shortfall-decision.e2e-spec.ts`) et par sa lecture comptable (E6c2,
 * `billable-amounts.e2e-spec.ts`).
 */
import type { PackingSheet } from "@lfd/contracts";

import { DeferredTerm } from "../src/platform/database/client/client.js";
import { E2E_STAFF_ID, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { pickupSite, placeOrderForCustomer, type PlacedTestOrder } from "./order-factory.js";
import {
  bagLines,
  closePlan,
  CROISSANT,
  markLine,
  MEMBER,
  packingOrderPath,
  SERVICE_DAY,
  sheetOf,
  STAFF,
} from "./production-day-fixture.js";

const DAY_MS = 86_400_000;

export interface Drawn extends PlacedTestOrder {
  readonly sheet: PackingSheet;
}

/** Une ligne commandée en plus des croissants — jamais mise au bac par la scène. */
export interface ExtraLine {
  readonly sku: string;
  readonly quantity: number;
}

/** Une commande au compte de 3 croissants (+ `extra`), tirée au colisage, `packed` croissants au sac. */
export async function accountOrder(
  ctx: E2eContext,
  packed: number,
  extra: readonly ExtraLine[] = [],
): Promise<Drawn> {
  const company = await createCompany(ctx.prisma);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  await attachTo(ctx.prisma, buyer.id, company.id);
  const placed = await placeOrderForCustomer(ctx, {
    buyerUserId: buyer.id,
    companyId: company.id,
    staffUserId: E2E_STAFF_ID,
    settlement: "account",
    forDay: SERVICE_DAY,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: CROISSANT, quantity: 3 }, ...extra],
  });
  return drawn(ctx, placed, packed);
}

export async function drawn(
  ctx: E2eContext,
  placed: PlacedTestOrder,
  packed: number,
): Promise<Drawn> {
  const { orderNumber } = placed;
  await closePlan(ctx);
  await ctx.drain();
  expect(await markLine(ctx)).toBe(204);
  await ctx.drain();
  const sheet = await sheetOf(ctx, orderNumber);
  if (packed > 0) {
    expect(await bagLines(ctx, sheet, [{ sku: CROISSANT, quantity: packed }])).toBe(204);
  }
  return { ...placed, sheet: await sheetOf(ctx, orderNumber) };
}

/** Une fenêtre qui couvre le jour de service, quel qu'il soit : seul le critère est éprouvé. */
export function windowAroundServiceDay(): { readonly from: Date; readonly to: Date } {
  return {
    from: new Date(0),
    to: new Date(Date.parse(`${SERVICE_DAY}T00:00:00.000Z`) + 30 * DAY_MS),
  };
}

export async function report(ctx: E2eContext, orderId: string): Promise<number> {
  const response = await ctx.asSub(STAFF).post(`${packingOrderPath(orderId)}/shortfall`);
  await ctx.drain();
  return response.status;
}

export async function decide(
  ctx: E2eContext,
  orderId: string,
): Promise<{ status: number; code: unknown }> {
  const response = await ctx
    .asSub(STAFF)
    .post(`/admin/orders/${orderId}/shortfall-decision`)
    .send({ remainder: "abandoned" });
  await ctx.drain();
  const body: unknown = response.body;
  const code = typeof body === "object" && body !== null && "code" in body ? body.code : null;
  return { status: response.status, code };
}
