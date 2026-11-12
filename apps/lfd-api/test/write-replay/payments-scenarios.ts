import { jsonBody } from "../e2e-harness.js";
import { createUser } from "../factories.js";
import { payByCard, placeOrder } from "../order-factory.js";
import { routeKey, STAFF, type ReplayWorld, type ScenarioSet } from "./scenario.js";
import {
  DEBTOR_RIB,
  PDF,
  companyWithOwner,
  completeEntity,
  mandatedCompany,
  pickupPoint,
} from "./seeds.js";
import { serviceDay } from "../e2e-harness.js";

const PAYMENTS = "lafoliecoffee/payments/http";
const OWNER = "replay-owner";

/** L'entité émettrice, une société et son détenteur, le RIB posé par la route. */
async function bankedCompany({ ctx }: ReplayWorld): Promise<string> {
  await completeEntity(ctx);
  const { companyId } = await companyWithOwner(ctx, OWNER);
  await ctx
    .asSub(STAFF)
    .put(`/admin/companies/${companyId}/bank-account`)
    .send({ ...DEBTOR_RIB, holderLegalForm: "SARL" })
    .expect(204);
  return companyId;
}

/** Un brouillon de mandat frappé par le staff. */
async function draftMandate(world: ReplayWorld): Promise<{ companyId: string; mandateId: string }> {
  const companyId = await bankedCompany(world);
  const minted = await world.ctx
    .asSub(STAFF)
    .post(`/admin/companies/${companyId}/mandate`)
    .expect(201);
  return { companyId, mandateId: jsonBody<{ id: string }>(minted).id };
}

const proof = {
  field: "file",
  content: PDF,
  filename: "mandat-signe.pdf",
  contentType: "application/pdf",
};

/** Les paiements : mandats, preuves, liens de paiement. */
export const PAYMENTS_SCENARIOS: ScenarioSet = {
  [routeKey(`${PAYMENTS}/admin-mandates.controller.ts`, "send")]: async (world) => {
    const { companyId, mandateId } = await draftMandate(world);
    return { sub: STAFF, path: `/admin/companies/${companyId}/mandate/${mandateId}/send` };
  },

  [routeKey(`${PAYMENTS}/admin-mandates.controller.ts`, "uploadProof")]: async (world) => {
    const { companyId } = await draftMandate(world);
    return { sub: STAFF, path: `/admin/companies/${companyId}/mandate/proof`, files: [proof] };
  },

  [routeKey(`${PAYMENTS}/company-mandate.controller.ts`, "uploadProof")]: async (world) => {
    const companyId = await bankedCompany(world);
    await world.ctx
      .asSub(STAFF)
      .put("/admin/feature-access/customerMandate")
      .send({ value: "open" })
      .expect(204);
    await world.ctx.asSub(OWNER).post(`/companies/${companyId}/mandate`).expect(200);
    return { sub: OWNER, path: `/companies/${companyId}/mandate/proof`, files: [proof] };
  },

  [routeKey(`${PAYMENTS}/admin-mandates.controller.ts`, "revoke")]: async ({ ctx }) => {
    const entityId = await completeEntity(ctx);
    const { companyId } = await mandatedCompany(ctx, entityId);
    return { sub: STAFF, path: `/admin/companies/${companyId}/mandate` };
  },

  [routeKey(`${PAYMENTS}/admin-payment-links.controller.ts`, "create")]: async ({ ctx }) => {
    const { companyId } = await companyWithOwner(ctx, OWNER);
    return {
      sub: STAFF,
      path: "/admin/accounting/payment-links",
      body: { companyId, amountCents: 12_000, label: "Régularisation" },
    };
  },

  [routeKey("lafoliecoffee/orders/http/admin-order-payment-links.controller.ts", "resend")]:
    async ({ ctx }) => {
      const pickupId = await pickupPoint(ctx);
      const { companyId, ownerId } = await companyWithOwner(ctx, OWNER);
      const order = await placeOrder(ctx, {
        buyerUserId: ownerId,
        companyId,
        forDay: serviceDay(),
        fulfillment: { method: "pickup", pickupSiteId: pickupId },
      });
      return { sub: STAFF, path: `/admin/accounting/payment-links/orders/${order.id}/resend` };
    },

  [routeKey(
    "lafoliecoffee/orders/revision/http/order-revisions.controller.ts",
    "proposeCardIncrease",
  )]: async ({ ctx }) => {
    const buyer = await createUser(ctx.prisma, { auth0Sub: OWNER, firstName: "Léa" });
    const pickupId = await pickupPoint(ctx);
    const day = serviceDay(7);
    const order = await placeOrder(ctx, {
      buyerUserId: buyer.id,
      forDay: day,
      fulfillment: { method: "pickup", pickupSiteId: pickupId },
    });
    await payByCard(ctx, order);
    const content = {
      requestedDeliveryDate: day,
      fulfillmentMethod: "pickup",
      pickupAddressId: pickupId,
      requestedWindow: { start: "07:00", end: "08:00" },
      note: "",
      lines: [{ sku: "VIE-001-1", quantity: 6 }],
    };
    const quote = await ctx
      .asSub(OWNER)
      .post(`/orders/${order.id}/revisions/quote`)
      .send(content)
      .expect(200);
    const { totalCents } = jsonBody<{ totalCents: number }>(quote);
    return {
      sub: OWNER,
      path: `/orders/${order.id}/revisions/card-increase`,
      body: { expectedRevision: 0, expectedTotalCents: totalCents, ...content },
      replay: "shown-once",
    };
  },
};
