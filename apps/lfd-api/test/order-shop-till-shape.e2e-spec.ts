import type { AdminPlacedOrderResponse } from "@lfd/contracts";

import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
  OrderStatus,
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
import { pickupSite } from "./order-factory.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

/**
 * E2E — **ce que la base tient d'une commande réglée à la caisse de la
 * boutique** (plan `documentation/commandes/passation/plan-commande-particulier-reglee-en-boutique.md`,
 * § 4.3 ; migrations `20261120130000_le_lieu_de_reglement` et
 * `20261120130100_la_forme_du_reglement_en_boutique`).
 *
 * Ce que seul ce niveau prouve : le CHECK `orders_shop_till_shape` refuse une
 * ligne `shop_till` hors de sa forme (le trou du `NULL` compris), et le
 * déclencheur `orders_settlement_venue_frozen` fige le lieu et le règlement
 * « non requis ».
 *
 * Aucune passation n'écrit encore `shop_till` : la ligne se fabrique en
 * recopiant, en SQL, une vraie commande de l'équipe au comptoir, dont seules
 * les colonnes du sujet changent. C'est la base qu'on éprouve, pas un chemin
 * du domaine.
 */

const BUYER = "auth0|acheteur-reglement-en-boutique";
const DAY = serviceDay(7);
const SHOP_TILL_ID = "ord_shop_till_e2e";
const SHOP_TILL_NUMBER = "ORD-987654";
const SHOP_TILL_TOKEN = "jeton-retrait-reglement-en-boutique";

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

/** Une commande de l'équipe saisie au comptoir — le modèle qu'on recopie. */
async function counterOrder(): Promise<{ readonly id: string; readonly companyId: string }> {
  const pickupId = await pickupSite(ctx.prisma);
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  const order = jsonBody<AdminPlacedOrderResponse>(
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/orders")
      .set(INTENT_KEY, freshIntent())
      .send({
        companyId: company.id,
        buyerUserId: user.id,
        settlement: "account",
        entryOrigin: "counter",
        requestedDeliveryDate: DAY,
        fulfillmentMethod: "pickup",
        pickupAddressId: pickupId,
        requestedWindow: { start: "07:00", end: "08:00" },
        note: "",
        lines: [{ sku: "VIE-001-1", quantity: 3 }],
      })
      .expect(201),
  );
  return { id: order.id, companyId: company.id };
}

/** La forme admise : un particulier, au comptoir, rien d'attendu chez nous. */
const SHOP_TILL_SHAPE: Readonly<Record<string, unknown>> = {
  id: SHOP_TILL_ID,
  order_number: SHOP_TILL_NUMBER,
  // Unique : la copie ne peut pas garder le jeton de retrait du modèle.
  handover_token: SHOP_TILL_TOKEN,
  company_id: null,
  billed_company_id: null,
  principal_company_id: null,
  principal_sees_amount: null,
  clientele: "public",
  payment_status: "not_required",
  settlement_venue: "shop_till",
};

/** Insère une copie du modèle, ses colonnes remplacées par `columns`. */
function insertCopy(sourceId: string, columns: Readonly<Record<string, unknown>>): Promise<number> {
  const overrides = JSON.stringify(columns);
  return ctx.prisma.$executeRaw`
    INSERT INTO "public"."orders"
    SELECT (jsonb_populate_record(NULL::"public"."orders", to_jsonb(o) || ${overrides}::jsonb)).*
      FROM "public"."orders" o
     WHERE o.id = ${sourceId}`;
}

describe("orders_shop_till_shape — la forme d'une commande réglée en boutique", () => {
  it("admet un particulier saisi au comptoir, sans rien d'attendu chez nous", async () => {
    const source = await counterOrder();

    await insertCopy(source.id, SHOP_TILL_SHAPE);

    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: SHOP_TILL_ID },
      select: { settlementVenue: true, paymentStatus: true },
    });
    expect(row).toEqual({ settlementVenue: "shop_till", paymentStatus: "not_required" });
  });

  it("refuse une clientèle inconnue (`NULL`) : le trou du NULL est fermé", async () => {
    const source = await counterOrder();

    await expect(insertCopy(source.id, { ...SHOP_TILL_SHAPE, clientele: null })).rejects.toThrow(
      /orders_shop_till_shape/u,
    );
  });

  it("refuse une commande portée par une société", async () => {
    const source = await counterOrder();

    await expect(
      insertCopy(source.id, { ...SHOP_TILL_SHAPE, company_id: source.companyId }),
    ).rejects.toThrow(/orders_shop_till_shape/u);
  });

  it("refuse un règlement attendu chez nous (`pending`)", async () => {
    const source = await counterOrder();

    await expect(
      insertCopy(source.id, { ...SHOP_TILL_SHAPE, payment_status: "pending" }),
    ).rejects.toThrow(/orders_shop_till_shape/u);
  });
});

describe("orders_settlement_venue_frozen — le lieu se fige à la passation", () => {
  it("refuse de retirer le lieu d'une commande réglée en boutique", async () => {
    await insertCopy((await counterOrder()).id, SHOP_TILL_SHAPE);

    await expect(
      ctx.prisma.order.update({ where: { id: SHOP_TILL_ID }, data: { settlementVenue: null } }),
    ).rejects.toThrow(/figé à la passation/u);
  });

  it("refuse de poser un lieu sur une commande déjà passée", async () => {
    const source = await counterOrder();

    await expect(
      ctx.prisma.order.update({ where: { id: source.id }, data: { settlementVenue: "shop_till" } }),
    ).rejects.toThrow(/figé à la passation/u);
  });

  it("refuse qu'elle quitte « non requis », comme le ferait l'annulation des non réglées", async () => {
    await insertCopy((await counterOrder()).id, SHOP_TILL_SHAPE);

    await expect(
      ctx.prisma.order.update({ where: { id: SHOP_TILL_ID }, data: { paymentStatus: "failed" } }),
    ).rejects.toThrow(/caisse de la boutique/u);
  });

  it("admet son annulation : le statut de la commande change, pas le règlement", async () => {
    await insertCopy((await counterOrder()).id, SHOP_TILL_SHAPE);

    await ctx.prisma.order.update({
      where: { id: SHOP_TILL_ID },
      data: { status: OrderStatus.cancelled },
    });

    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: SHOP_TILL_ID },
      select: { status: true, settlementVenue: true },
    });
    expect(row).toEqual({ status: OrderStatus.cancelled, settlementVenue: "shop_till" });
  });
});
