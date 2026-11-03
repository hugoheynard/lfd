/**
 * **La scène du départ incomplet** — une commande au compte tirée au colisage,
 * son manque signalé, sa décision. Partagée par la décision (E6b + E6c1,
 * `shortfall-decision.e2e-spec.ts`) et par sa lecture comptable (E6c2,
 * `billable-amounts.e2e-spec.ts`).
 */
import type { PackingSheet } from "@lfd/contracts";

import { DeferredTerm } from "../src/platform/database/client/client.js";
import { binTypeId } from "./delivery-loading-scene.js";
import { E2E_STAFF_ID, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import {
  type FulfillmentSeed,
  type OrderSeed,
  pickupSite,
  placeOrderForCustomer,
  type PlacedTestOrder,
} from "./order-factory.js";
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

/** Comment la commande part : son acheminement, et la fenêtre qu'il exige. */
export interface SceneFulfillment {
  readonly fulfillment: FulfillmentSeed;
  readonly window?: OrderSeed["window"];
}

/**
 * Une livraison à une adresse dictée, « avant 10 h » (une adresse livrée à
 * échéance refuse une heure de début). La zone du 73150 est à semer.
 */
export const SCENE_DELIVERY: SceneFulfillment = {
  fulfillment: {
    method: "delivery",
    address: {
      label: "",
      ligne1: "1 rue du Test",
      ligne2: "",
      codePostal: "73150",
      ville: "Val-d'Isère",
      pays: "France",
    },
  },
  window: { start: null, end: "10:00" },
};

/**
 * Une commande au compte de 3 croissants (+ `extra`), tirée au colisage,
 * `packed` croissants au sac. Au retrait, sauf `how` contraire.
 */
export async function accountOrder(
  ctx: E2eContext,
  packed: number,
  extra: readonly ExtraLine[] = [],
  how?: SceneFulfillment,
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
    fulfillment:
      how === undefined
        ? { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) }
        : await bookedFulfillment(ctx, company.id, how),
    ...(how?.window === undefined ? {} : { window: how.window }),
    lines: [{ sku: CROISSANT, quantity: 3 }, ...extra],
  });
  const container =
    how?.fulfillment.method === "delivery"
      ? { nature: "bin", binTypeId: await binTypeId(ctx), half: false, innerBags: 0 }
      : undefined;
  return drawn(ctx, placed, packed, container);
}

/**
 * Une livraison part d'une adresse INSCRITE au carnet de la société, qui porte
 * l'échéance demandée : depuis E1 (Hugo, 2026-11-03, P2a 7e93eec00 —
 * `plan-prix-de-la-saisie.md`), la saisie de l'équipe pour un pro ne demande
 * qu'une fenêtre inscrite sur l'adresse, comme le pro lui-même. Une adresse
 * dictée n'en porte aucune, et la scène était refusée
 * (`orders.fulfillment.deadline_not_registered`). Le retrait passe tel quel.
 */
async function bookedFulfillment(
  ctx: E2eContext,
  companyId: string,
  how: SceneFulfillment,
): Promise<FulfillmentSeed> {
  const { fulfillment, window } = how;
  if (fulfillment.method !== "delivery" || window === undefined) {
    return fulfillment;
  }
  const created = await ctx
    .asSub(E2E_STAFF_SUB)
    .post(`/admin/companies/${companyId}/delivery-addresses`)
    .send({
      ...fulfillment.address,
      isDefault: true,
      specs: {
        signatureRequired: null,
        note: "",
        slotList: { mode: "everyday", slots: [] },
        deliveryContact: null,
        gps: null,
        windowMode: "deadline",
        deadlines: { mode: "everyday", times: [window.end] },
      },
    })
    .expect(201);
  return { ...fulfillment, addressId: jsonBody<{ id: string }>(created).id };
}

/** `container` : le contenant ouvert au colisage — un sac par défaut, un bac pour une livraison. */
export async function drawn(
  ctx: E2eContext,
  placed: PlacedTestOrder,
  packed: number,
  container?: object,
): Promise<Drawn> {
  const { orderNumber } = placed;
  await closePlan(ctx);
  await ctx.drain();
  expect(await markLine(ctx)).toBe(204);
  await ctx.drain();
  const sheet = await sheetOf(ctx, orderNumber);
  if (packed > 0) {
    expect(await bagLines(ctx, sheet, [{ sku: CROISSANT, quantity: packed }], container)).toBe(204);
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
