/**
 * E2E — **la facture carte d'une commande au poids**
 * (`documentation/pricing/vente-au-poids.md`, § 3 bis, P7).
 *
 * Ce que seul le vrai SQL prouve : `order_lines.sale_unit` est relu par le
 * lecteur des bons (`frozen-invoice-order.mapper.ts`), la facture émise par le
 * vrai déclencheur durable porte une ligne `KGM` en grammes à côté d'une ligne
 * `H87`, son XML Factur-X — celui que le PDF joint, octet pour octet — écrit
 * BT-129 au gramme près, et le PDF imprime « 1,001 kg ». Une facture émise ne
 * bouge plus : relue deux fois, elle est la même.
 *
 * ⚠️ Un particulier n'a pas de facture carte (`cardInvoiceVerdict`, § 2 bis-9 :
 * une commande sans société est publique, vérifié le 2026-10-29) : la suite
 * passe par un pro payé par carte, le seul chemin où une commande au poids
 * devient une pièce Factur-X sans BL.
 */
import { CommandBus } from "@nestjs/cqrs";

import { InvoiceReader } from "../src/b2b/accounting/domain/ports/invoice.reader.js";
import {
  drawnUnicodeText,
  streamsWith,
} from "../src/b2b/accounting/domain/services/__tests__/pdf-objects.js";
import { renderFacturXml } from "../src/b2b/accounting/domain/services/facturx-xml.js";
import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import { MarkOrderFulfilledCommand } from "../src/b2b/orders/application/commands/mark-order-fulfilled.command.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { OutboxRelay } from "../src/platform/outbox/outbox-relay.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { addBillingAddress, attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble, pickupSite, placeOrder } from "./order-factory.js";

const ENTITIES = "/admin/accounting/legal-entities";
const STAFF = "staff-e2e";
/** Le pain au chocolat du semis, vendu au poids, au gramme. */
const WEIGHED = "VIE-002";
/** 12,34567 € HT le kilo : un prix au millicentime. */
const PRO_PRICE_PER_KG_MILLICENTS = 1_234_567;
const WEIGHT_GRAMS = 1_001;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      {
        token: AdminTokenVerifier,
        value: { verify: () => Promise.resolve({ subject: STAFF, scopes: [] }) },
      },
      { token: PaymentGateway, value: cardGatewayDouble("pi_p7") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await ctx.prisma.catalogItem.update({
    where: { sku: `${WEIGHED}-1` },
    data: {
      saleUnit: "weight",
      weightStepGrams: 1,
      weightMinGrams: null,
      priceMillicents: PRO_PRICE_PER_KG_MILLICENTS,
    },
  });
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub(STAFF);
}

async function settle(): Promise<void> {
  const relay = ctx.app.get(OutboxRelay);
  for (let round = 0; round < 4; round += 1) {
    await relay.sweep();
    await ctx.drain();
  }
}

/** L'entité émettrice, complète, mentions de la facture posées. */
async function entity(): Promise<void> {
  const id = jsonBody<{ id: string }>(
    await staff()
      .post(ENTITIES)
      .send({
        name: "La Folie Douce",
        legalForm: "SAS",
        siren: "552100554",
        rcs: "Chambéry B 552 100 554",
        shareCapitalCents: 1_000_000,
        vatNumber: "FR89552100554",
        address: {
          line1: "12 rue du Fournil",
          line2: "",
          postalCode: "73000",
          city: "Chambéry",
          countryCode: "FR",
        },
      })
      .expect(201),
  ).id;
  await staff()
    .put(`${ENTITIES}/${id}/creditor-identifier`)
    .send({ ics: "FR72ZZZ123456" })
    .expect(204);
  await staff()
    .put(`${ENTITIES}/${id}/creditor-account`)
    .send({
      iban: "FR1420041010050500013M02606",
      bic: "BNPAFRPP",
      holder: "La Folie Douce",
      line1: "12 rue du Fournil",
      line2: "",
      postalCode: "73000",
      city: "Chambéry",
      countryCode: "FR",
    })
    .expect(204);
  await staff()
    .put(`${ENTITIES}/${id}/invoice-payment-terms`)
    .send({
      latePenaltyRateBasisPoints: 1_415,
      recoveryIndemnityCents: 4_000,
      earlyPaymentDiscount: "néant",
    })
    .expect(204);
  await staff().put(`${ENTITIES}/${id}/invoice-prefix`).send({ prefix: "LFD" }).expect(204);
}

/** Une commande pro réglée par carte : trois croissants et 1 001 g de pain au chocolat. */
async function weighedCardOrder(): Promise<{
  orderId: string;
  orderNumber: string;
  intent: string;
}> {
  const company = await createCompany(ctx.prisma, { raisonSociale: "Boulangerie du Port" });
  await addBillingAddress(ctx.prisma, company.id);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { vatNumber: "FR40303265045" },
  });
  const owner = await createUser(ctx.prisma, { auth0Sub: "p7-owner" });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  const order = await placeOrder(ctx, {
    buyerUserId: owner.id,
    companyId: company.id,
    settlement: "card",
    placedAt: new Date(daysAgo(1)),
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [
      { sku: "VIE-001", quantity: 3 },
      { sku: WEIGHED, quantity: WEIGHT_GRAMS, saleUnit: "weight" },
    ],
  });
  return { orderId: order.id, orderNumber: order.orderNumber, intent: order.paymentIntentId ?? "" };
}

async function pdfOf(invoiceId: string): Promise<Buffer> {
  const served = await staff()
    .get(`/admin/accounting/invoices/${invoiceId}/pdf`)
    .buffer()
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  return Buffer.from(jsonBody<Uint8Array>(served));
}

describe("la facture carte d'une commande au poids (P7)", () => {
  it("émet une ligne KGM en grammes à côté du H87, son XML et son PDF disent 1,001 kg", async () => {
    await entity();
    const order = await weighedCardOrder();
    const line = await ctx.prisma.orderLine.findFirstOrThrow({
      where: { orderId: order.orderId, sku: WEIGHED },
    });
    expect(line).toMatchObject({ saleUnit: "weight", quantity: WEIGHT_GRAMS });

    await ctx.app
      .get(CommandBus)
      .execute(new ConfirmOrderPaymentCommand(order.intent, "succeeded"));
    await ctx.app
      .get(CommandBus)
      .execute(
        new MarkOrderFulfilledCommand(order.orderNumber, STAFF, new Date(daysAgo(0)), "manual"),
      );
    await settle();

    const outcome = await ctx.prisma.cardInvoiceOutcome.findUnique({
      where: { orderId: order.orderId },
    });
    expect(outcome).toMatchObject({ outcome: "issued" });
    const row = await ctx.prisma.invoice.findFirstOrThrow({
      where: { orders: { some: { orderId: order.orderId } } },
    });
    const invoice = await ctx.app.get(InvoiceReader).byId(row.id);
    const lines = invoice?.toState().lines ?? [];
    expect(lines.map((l) => [l.sku, l.unitCode, l.quantityThousandths])).toEqual([
      ["VIE-001", "H87", 3_000],
      [WEIGHED, "KGM", WEIGHT_GRAMS],
    ]);
    expect(lines[1]).toMatchObject({
      unitPriceMillicents: PRO_PRICE_PER_KG_MILLICENTS,
      amountCents: line.lineTotalCents,
    });

    const pdf = await pdfOf(row.id);
    const [attached] = streamsWith(pdf, "/Type /EmbeddedFile");
    const xml = attached?.toString("utf8") ?? "";
    expect(xml).toBe(invoice === null ? "" : renderFacturXml(invoice));
    expect(xml).toContain('<ram:BilledQuantity unitCode="KGM">1.001</ram:BilledQuantity>');
    expect(xml).toContain('<ram:BilledQuantity unitCode="H87">3</ram:BilledQuantity>');
    expect(xml).not.toContain("BasisQuantity");
    expect(drawnUnicodeText(pdf)).toContain("1,001 kg");

    // Définitive : relue, la pièce est la même ligne à ligne.
    const reread = await ctx.app.get(InvoiceReader).byId(row.id);
    expect(reread?.toState().lines).toEqual(lines);
  });
});
