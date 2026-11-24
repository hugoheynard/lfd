/**
 * E2E — **la passation d'une échéance** (`OccurrencePlacement`, plan
 * `plan-bloc-recurrent.md`, § 6.1) : l'implémentation du commerce, appelée
 * comme le balayage l'appelle, contre le vrai serveur.
 *
 * Ce que seul le vrai SQL prouve : la commande porte sa provenance complète
 * et les CGV que le panier applique à son jour ; **une échéance, au plus une
 * commande**, tenue par l'index `orders_one_per_occurrence` même quand deux
 * passations courent ensemble ; les refus nommés qui n'écrivent rien ; et le
 * payeur public, refusé à l'ouverture comme à la passation.
 */
import { WORKSPACE_HEADER } from "@lfd/contracts";

import {
  OccurrencePlacement,
  type OccurrencePlacementRequest,
} from "../src/recurring/channels/commerce/index.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_ID, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { pickupSite } from "./order-factory.js";
import { publishSalesTerms, weeklyBasket } from "./recurring-scene.js";

const BUYER = "auth0|recurring-buyer";
/** Une semaine devant : l'horizon de passation (Q1 du planificateur). */
const DAY = serviceDay(7);
/** Le panier, par son identifiant opaque : la commande ne le relit pas. */
const BASKET = "basket_e2e_placement";

let ctx: E2eContext;
let placement: OccurrencePlacement;
let companyId = "";
let pickupId = "";
let buyerId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
  placement = ctx.app.get(OccurrencePlacement);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await publishSalesTerms(ctx);
  pickupId = await pickupSite(ctx.prisma);
  companyId = (await createCompany(ctx.prisma, { status: CompanyStatus.active })).id;
  await ctx.prisma.company.update({
    where: { id: companyId },
    data: { grantedTerms: ["monthly"] },
  });
  buyerId = (await createUser(ctx.prisma, { auth0Sub: BUYER })).id;
  await attachTo(ctx.prisma, buyerId, companyId, CustomerRole.owner);
});

/** L'échéance telle que le balayage la présente : le gabarit, sans dérogation. */
function request(day = DAY): OccurrencePlacementRequest {
  return {
    basketId: BASKET,
    serviceDay: day,
    buyerUserId: buyerId,
    companyId,
    routing: {
      method: "pickup",
      deliveryAddress: null,
      pickupAddressId: pickupId,
      window: { start: "07:00", end: "08:00" },
    },
    lines: [{ sku: "VIE-001-1", quantity: 6 }],
    note: "Le lundi",
    deltas: { added: [], removed: [] },
    // Une révision que le contenu n'a pas : la passation l'IMPOSE (§ 7), elle
    // ne relit pas celle en vigueur.
    salesTerms: { key: "salesTermsPro", revision: 7, fileId: null },
  };
}

describe("la passation d'une échéance", () => {
  it("passe la commande au compte, avec sa provenance complète et les CGV du panier", async () => {
    const outcome = await placement.place(request());

    expect(outcome.kind).toBe("placed");
    const order = await ctx.prisma.order.findFirstOrThrow({
      where: { fromSubscriptionId: BASKET },
    });
    expect(outcome).toMatchObject({ orderId: order.id });
    expect(order.fromOccurrenceDay?.toISOString().slice(0, 10)).toBe(DAY);
    expect(order).toMatchObject({
      companyId,
      placedByStaffId: null,
      salesTermsKey: "sales-terms-pro",
      salesTermsRevision: 7,
      recurringDeltas: { added: [], removed: [] },
    });
  });

  /**
   * (a) Deux passations concurrentes de la même échéance : la seconde échoue
   * sur `orders_one_per_occurrence`, est rattrapée par le NOM de la
   * contrainte, relit la commande existante, et la rend comme `placed`.
   */
  it("deux passations concurrentes : une seule commande, deux réponses `placed` qui la nomment", async () => {
    const [first, second] = await Promise.all([
      placement.place(request()),
      placement.place(request()),
    ]);

    const orders = await ctx.prisma.order.findMany({ where: { fromSubscriptionId: BASKET } });
    expect(orders).toHaveLength(1);
    expect(first).toMatchObject({ kind: "placed", orderId: orders[0]?.id });
    expect(second).toMatchObject({ kind: "placed", orderId: orders[0]?.id });
    // Un rejeu après coup rend la même.
    expect(await placement.place(request())).toMatchObject({
      kind: "placed",
      orderId: orders[0]?.id,
    });
  });

  it("une société sans crédit : refus corrigeable nommé, aucune commande", async () => {
    await ctx.prisma.company.update({ where: { id: companyId }, data: { grantedTerms: [] } });

    expect(await placement.place(request())).toMatchObject({
      kind: "refused",
      cause: "no_settlement",
      final: false,
    });
    expect(await ctx.prisma.order.count({ where: { fromSubscriptionId: BASKET } })).toBe(0);
  });

  it("l'acheteur parti de la société : refus nommé", async () => {
    await ctx.prisma.membership.deleteMany({ where: { companyId } });

    expect(await placement.place(request())).toMatchObject({
      kind: "refused",
      cause: "buyer_left",
    });
    expect(await ctx.prisma.order.count({ where: { fromSubscriptionId: BASKET } })).toBe(0);
  });

  it("trop tard pour aujourd'hui : refus définitif, aucune commande, la dérogation reste à l'équipe", async () => {
    const today = serviceDay(0);
    const waiver = await ctx.prisma.orderCutoffWaiver.create({
      data: {
        companyId,
        fulfillmentDate: new Date(`${today}T00:00:00.000Z`),
        reason: "Livraison exceptionnelle",
        grantedByStaffId: E2E_STAFF_ID,
      },
    });

    const outcome = await placement.place(request(today));

    expect(outcome.kind).toBe("refused");
    expect(await ctx.prisma.order.count({ where: { fromSubscriptionId: BASKET } })).toBe(0);
    expect(
      await ctx.prisma.orderCutoffWaiver.findUniqueOrThrow({ where: { id: waiver.id } }),
    ).toMatchObject({ usedByOrderId: null, usedAt: null });
  });
});

/**
 * (d) Le payeur public (engagement budgétaire) est hors du périmètre du
 * planificateur (§ 0) : son panier ne s'ouvre pas, et la passation garde son
 * propre refus — le filet, si un panier existait quand même.
 */
describe("le payeur public", () => {
  beforeEach(async () => {
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { formeJuridique: "public_local_authority" },
    });
  });

  it("n'ouvre pas de panier : 409 qui nomme la société et le geste, rien n'est écrit", async () => {
    const refused = await ctx
      .asSub(BUYER)
      .post("/subscriptions")
      .set(INTENT_KEY, freshIntent())
      .set(WORKSPACE_HEADER, companyId)
      .send(weeklyBasket({ pickupAddressId: pickupId }));

    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: "subscriptions.public_payer" });
    expect(JSON.stringify(refused.body)).toContain("engagement budgétaire");
    expect(await ctx.prisma.basket.count()).toBe(0);
    expect(await ctx.prisma.occurrence.count()).toBe(0);
    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "recurring.basket_opened" } }),
    ).toBe(0);
  });

  it("la passation le refuse aussi, sans commande", async () => {
    expect(await placement.place(request())).toMatchObject({
      kind: "refused",
      cause: "order_refused",
    });
    expect(await ctx.prisma.order.count({ where: { fromSubscriptionId: BASKET } })).toBe(0);
  });
});
