/**
 * E2E des **CGV figées à la passation** (plan
 * `documentation/legal/plan-cgv-par-audience.md`, lot 3, C4′) — sur les TROIS
 * chemins de passation, contre la vraie base : le CHECK sur la clé, la clé
 * étrangère vers le PDF, et la relecture du détail de commande.
 *
 * Le texte qui s'applique suit l'audience qui TARIFE (`audienceOf`) : une
 * société ACTIVE porte les CGV pro, une société en attente et un visiteur
 * celles des particuliers (C2″).
 */
import { randomUUID } from "node:crypto";

import type {
  AdminPlacedOrderResponse,
  LegalDocumentFileDeposited,
  OrderSalesTermsResponse,
  PlacedOrderResponse,
} from "@lfd/contracts";

import { PlaceShopOrderCommand } from "../src/b2b/orders/application/commands/place-shop-order.command.js";
import { PlaceShopOrderHandler } from "../src/b2b/orders/application/commands/place-shop-order.handler.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
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
import { prose } from "./legal-document-writes.js";

const MEMBER = "auth0|membre-cgv";
const PDF = Buffer.from("%PDF-1.7\n%%EOF", "latin1");
const SERVICE_DAY = serviceDay();

let intentSeq = 0;
const fakeGateway = {
  createIntent: () => {
    intentSeq += 1;
    const paymentIntentId = `pi_cgv_${String(intentSeq)}`;
    return Promise.resolve({ paymentIntentId, clientSecret: `${paymentIntentId}_secret` });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;
let pickupId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: PaymentGateway, value: fakeGateway }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "5 rue du Four",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
});

const staff = () => ctx.asSub(E2E_STAFF_SUB);

/** Une société au statut choisi, un acheteur rattaché, et le crédit au compte. */
async function seedCompany(status: CompanyStatus): Promise<{ companyId: string; buyerId: string }> {
  const company = await createCompany(ctx.prisma, { status });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: MEMBER, email: "membre@cgv.test" });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  return { companyId: company.id, buyerId: buyer.id };
}

/** Rédige un article du texte, pour qu'il ait une révision. */
async function writeText(mention: "salesTerms" | "salesTermsPro"): Promise<void> {
  await staff()
    .post(`/admin/content/legal/${mention}/paragraphs`)
    .send({ ...prose(mention), expectedRevision: 0 })
    .expect(201);
}

async function depositPdf(mention: "salesTerms" | "salesTermsPro"): Promise<string> {
  const response = await staff()
    .post(`/admin/content/legal/${mention}/files`)
    .attach("file", PDF, "cgv.pdf")
    .expect(201);
  return jsonBody<LegalDocumentFileDeposited>(response).id;
}

const order = (companyId: string | null): Record<string, unknown> => ({
  companyId,
  idempotencyKey: randomUUID(),
  pickupAddressId: pickupId,
  requestedDeliveryDate: SERVICE_DAY,
  fulfillmentMethod: "pickup",
  requestedWindow: { start: "07:00", end: "08:00" },
  note: "",
  lines: [{ sku: "VIE-001", quantity: 3 }],
});

async function salesTermsOf(orderId: string): Promise<OrderSalesTermsResponse> {
  return jsonBody<OrderSalesTermsResponse>(
    await staff().get(`/admin/orders/${orderId}/sales-terms`).expect(200),
  );
}

describe("le client pour lui-même (place-order)", () => {
  it("une société ACTIVE porte les CGV pro, leur révision et leur PDF — « acceptées »", async () => {
    const { companyId } = await seedCompany(CompanyStatus.active);
    await writeText("salesTermsPro");
    const fileId = await depositPdf("salesTermsPro");

    const placed = jsonBody<PlacedOrderResponse>(
      await ctx.asSub(MEMBER).post("/orders").send(order(companyId)).expect(201),
    );

    const { salesTerms } = await salesTermsOf(placed.id);
    expect(salesTerms).toMatchObject({
      document: "salesTermsPro",
      revision: 1,
      file: { id: fileId },
      placedByStaff: false,
    });
  });

  /** C2″ : une société en attente paie les prix des particuliers, et en porte les CGV. */
  it("une société EN ATTENTE porte les CGV particuliers", async () => {
    const { companyId } = await seedCompany(CompanyStatus.pending);

    const placed = jsonBody<PlacedOrderResponse>(
      await ctx.asSub(MEMBER).post("/orders").send(order(companyId)).expect(201),
    );

    expect((await salesTermsOf(placed.id)).salesTerms).toMatchObject({
      document: "salesTerms",
      revision: null,
      file: null,
    });
  });

  it("des CGV pro jamais rédigées : la clé est posée, révision et PDF nuls", async () => {
    const { companyId } = await seedCompany(CompanyStatus.active);

    const placed = jsonBody<PlacedOrderResponse>(
      await ctx.asSub(MEMBER).post("/orders").send(order(companyId)).expect(201),
    );

    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect([row.salesTermsKey, row.salesTermsRevision, row.salesTermsFileId]).toEqual([
      "sales-terms-pro",
      null,
      null,
    ]);
  });
});

describe("l'équipe pour un client (place-order-for-customer)", () => {
  it("porte les CGV du CLIENT, et le détail les dit « applicables »", async () => {
    const { companyId, buyerId } = await seedCompany(CompanyStatus.active);
    await writeText("salesTermsPro");

    const placed = jsonBody<AdminPlacedOrderResponse>(
      await staff()
        .post("/admin/orders")
        .send({ ...order(companyId), buyerUserId: buyerId, settlement: "account" })
        .expect(201),
    );

    expect((await salesTermsOf(placed.id)).salesTerms).toMatchObject({
      document: "salesTermsPro",
      revision: 1,
      file: null,
      placedByStaff: true,
    });
  });
});

describe("la boutique sans compte (place-shop-order)", () => {
  it("porte les CGV particuliers et leur PDF, et un rejeu n'en change rien", async () => {
    await writeText("salesTerms");
    const fileId = await depositPdf("salesTerms");
    const payload = {
      idempotencyKey: randomUUID(),
      buyer: { firstName: "Camille", email: "camille@visiteur.fr", phone: "0600000000" },
      fulfillmentMethod: "pickup" as const,
      requestedWindow: { start: "07:00", end: "08:00" },
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddressId: pickupId,
      requestedDeliveryDate: SERVICE_DAY,
      note: "",
      lines: [{ sku: "VIE-001", quantity: 3 }],
    };
    const handler = ctx.app.get(PlaceShopOrderHandler);

    const placed = await handler.execute(new PlaceShopOrderCommand(payload));
    await ctx.drain();
    // Un nouveau PDF entre-temps : le rejeu ne doit pas le figer à la place.
    await depositPdf("salesTerms");
    const replayed = await handler.execute(new PlaceShopOrderCommand(payload));
    await ctx.drain();

    expect(replayed.id).toBe(placed.id);
    expect(await ctx.prisma.order.count()).toBe(1);
    expect((await salesTermsOf(placed.id)).salesTerms).toMatchObject({
      document: "salesTerms",
      revision: 1,
      file: { id: fileId },
      placedByStaff: false,
    });
  });
});

describe("la base", () => {
  it("refuse une clé de CGV hors des deux textes (CHECK)", async () => {
    const { companyId } = await seedCompany(CompanyStatus.active);
    const placed = jsonBody<PlacedOrderResponse>(
      await ctx.asSub(MEMBER).post("/orders").send(order(companyId)).expect(201),
    );

    await expect(
      ctx.prisma.order.update({ where: { id: placed.id }, data: { salesTermsKey: "privacy" } }),
    ).rejects.toThrow(/orders_sales_terms_key_check/u);
  });

  it("une commande d'avant la colonne se lit sans CGV, on n'en invente pas", async () => {
    const { companyId } = await seedCompany(CompanyStatus.active);
    const placed = jsonBody<PlacedOrderResponse>(
      await ctx.asSub(MEMBER).post("/orders").send(order(companyId)).expect(201),
    );
    await ctx.prisma.order.update({
      where: { id: placed.id },
      data: { salesTermsKey: null, salesTermsRevision: null, salesTermsFileId: null },
    });

    expect((await salesTermsOf(placed.id)).salesTerms).toBeNull();
  });
});
