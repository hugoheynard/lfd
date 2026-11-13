/**
 * E2E de **la facture carte sur le livré** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, lot F).
 *
 * Ce que seul le vrai SQL prouve :
 * - le réveil : une commande carte pro remise dont le solde manque attend
 *   (`awaiting_settlement`, rien d'émis, rien de rangé) ; le rapprochement des
 *   BL pose le solde, publie `order.billing_settled`, et la facture part par
 *   la vraie boîte d'envoi, sans « Réessayer » ;
 * - le fait part à chaque écriture du solde, au compte compris, et son abonné
 *   écarte une commande au compte sans relance ni lettre morte ;
 * - la non-régression : sur une commande carte complète avec une remise de
 *   panier, le Factur-X du livré est celui de l'ancienne lecture (la commande).
 */
import { CommandBus } from "@nestjs/cqrs";

import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { prepareCardInvoice } from "../src/lafoliecoffee/accounting/application/card-invoice-support.js";
import { ISSUE_CARD_INVOICE_ON_BILLING_SETTLED } from "../src/lafoliecoffee/accounting/application/handlers/issue-card-invoice-on-billing-settled.handler.js";
import { CardInvoicingReader } from "../src/lafoliecoffee/accounting/domain/ports/card-invoicing.reader.js";
import { CreditorReader } from "../src/lafoliecoffee/accounting/domain/ports/creditor.reader.js";
import { InvoiceIssuersReader } from "../src/lafoliecoffee/accounting/domain/ports/invoice-issuers.reader.js";
import { StatementBuyerReader } from "../src/lafoliecoffee/accounting/domain/ports/statement-buyer.reader.js";
import { renderFacturXml } from "../src/lafoliecoffee/accounting/domain/services/facturx-xml.js";
import { InvoiceNumber } from "../src/lafoliecoffee/accounting/domain/value-objects/invoice-number.js";
import { BILLABLE_INVOICE_ORDER_SELECT } from "../src/lafoliecoffee/accounting/infrastructure/billable-invoice-order.mapper.js";
import { toFrozenInvoiceOrder } from "../src/lafoliecoffee/accounting/infrastructure/frozen-invoice-order.mapper.js";
import { ReconcileDeliveryNotesCommand } from "../src/lafoliecoffee/delivery-notes/application/commands/reconcile-delivery-notes.command.js";
import { MarkOrderFulfilledCommand } from "../src/lafoliecoffee/orders/application/commands/mark-order-fulfilled.command.js";
import { ORDER_BILLING_SETTLED } from "../src/lafoliecoffee/orders/domain/events/order-billing-settled.fact.js";
import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { OutboxRelay } from "../src/platform/outbox/outbox-relay.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { addBillingAddress, attachTo, createCompany, createUser } from "./factories.js";
import { cardPaid } from "./card-payments.js";
import { cardGatewayDouble, pickupSite, placeOrder } from "./order-factory.js";
import { posePromotion, promotionTerms } from "./promotion-fixtures.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const ENTITIES = "/admin/accounting/legal-entities";
const STAFF = "staff-e2e";

let ctx: E2eContext;
let seq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      {
        token: AdminTokenVerifier,
        value: { verify: () => Promise.resolve({ subject: STAFF, scopes: [] }) },
      },
      { token: CardProviders, value: cardGatewayDouble("pi_lot_f") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  seq = 0;
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(STAFF);

async function settle(): Promise<void> {
  const relay = ctx.app.get(OutboxRelay);
  for (let round = 0; round < 4; round += 1) {
    await relay.sweep();
    await ctx.drain();
  }
}

async function entity(): Promise<void> {
  const id = jsonBody<{ id: string }>(
    await staff()
      .post(ENTITIES)
      .set(INTENT_KEY, freshIntent())
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

interface Placed {
  readonly id: string;
  readonly orderNumber: string;
  readonly intent: string;
}

async function proOrder(
  options: {
    readonly account?: boolean;
    readonly lines?: Parameters<typeof placeOrder>[1]["lines"];
  } = {},
): Promise<Placed> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: `Boulangerie F${String(seq)}` });
  await addBillingAddress(ctx.prisma, company.id);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: {
      vatNumber: "FR40303265045",
      ...(options.account === true ? { grantedTerms: ["monthly"] } : {}),
    },
  });
  const owner = await createUser(ctx.prisma, { auth0Sub: `lot-f-owner-${String(seq)}` });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  const order = await placeOrder(ctx, {
    buyerUserId: owner.id,
    companyId: company.id,
    settlement: options.account === true ? "account" : "card",
    placedAt: new Date(daysAgo(1)),
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    ...(options.lines === undefined ? {} : { lines: options.lines }),
  });
  return { id: order.id, orderNumber: order.orderNumber, intent: order.paymentIntentId ?? "" };
}

async function handOver(order: Placed): Promise<void> {
  await ctx.app
    .get(CommandBus)
    .execute(
      new MarkOrderFulfilledCommand(order.orderNumber, STAFF, new Date(daysAgo(0)), "manual"),
    );
  await settle();
}

function invoicesOf(orderId: string) {
  return ctx.prisma.invoice.findMany({ where: { orders: { some: { orderId } } } });
}

function settledFactsOf(orderId: string) {
  return ctx.prisma.outboxMessage.findMany({
    where: { type: ORDER_BILLING_SETTLED, payload: { path: ["orderId"], equals: orderId } },
    select: { key: true },
  });
}

describe("le réveil au solde (lot F, § 3.5)", () => {
  it("remise sans solde : la facture attend ; le rapprochement pose le solde et la facture part seule", async () => {
    await entity();
    const order = await proOrder();
    await handOver(order);
    // L'état d'une commande remise avant le solde (avant E6c1) : facturable
    // effacé — la règle « tout ou rien » du CHECK est tenue.
    await ctx.prisma.$executeRaw`
      UPDATE "public"."orders" SET
        "billable_subtotal_cents" = NULL, "billable_discount_cents" = NULL,
        "billable_voucher_discount_cents" = NULL, "billable_delivery_fee_cents" = NULL,
        "billable_late_fee_cents" = NULL, "billable_vat_cents" = NULL,
        "billable_vat_shares" = NULL, "billable_total_cents" = NULL, "settled_on" = NULL
      WHERE "id" = ${order.id}`;
    await cardPaid(ctx, order.intent);
    await settle();

    expect(await invoicesOf(order.id)).toEqual([]);
    const retried = await staff()
      .post(`/admin/accounting/card-invoices/${order.id}/retry`)
      .expect(200);
    expect(jsonBody<{ outcome: string }>(retried).outcome).toBe("awaiting_settlement");
    expect(await ctx.prisma.cardInvoiceOutcome.count()).toBe(0);

    await ctx.app.get(CommandBus).execute(new ReconcileDeliveryNotesCommand());
    await settle();

    const [invoice, ...others] = await invoicesOf(order.id);
    expect(others).toEqual([]);
    const { billableTotalCents } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(invoice).toMatchObject({ type: "380", totalTtcCents: billableTotalCents });
    expect(await settledFactsOf(order.id)).toHaveLength(2);
  });

  it("une commande au compte : le fait part, l'abonné l'écarte sans erreur ni relance", async () => {
    await entity();
    const order = await proOrder({ account: true });
    await handOver(order);

    expect(await settledFactsOf(order.id)).toHaveLength(1);
    const deliveries = await ctx.prisma.outboxDelivery.findMany({
      where: {
        subscriber: ISSUE_CARD_INVOICE_ON_BILLING_SETTLED,
        message: { type: ORDER_BILLING_SETTLED },
      },
    });
    // Livré du premier coup : ni relance, ni lettre morte.
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ attempts: 0, lastError: null });
    expect(deliveries[0]?.deliveredAt).not.toBeNull();
    expect(await invoicesOf(order.id)).toEqual([]);
    expect(await ctx.prisma.cardInvoiceOutcome.count()).toBe(0);
  });
});

describe("la non-régression du contenu (lot F, § 3.3)", () => {
  it("commande carte complète, remise de panier : le Factur-X du livré est celui de la commande", async () => {
    await entity();
    await posePromotion(
      staff(),
      promotionTerms({
        internalName: "Moins vingt au panier",
        label: { fr: "Moins vingt pour cent", en: null, it: null },
        effect: { kind: "percent_off", value: 2_000 },
        fulfillment: { kind: "basket", pickup: "all", delivery: "all" },
      }),
    );
    ctx.app.get(PricingMaterialsCache).invalidate();
    const order = await proOrder({
      lines: [
        { sku: "VIE-001-1", quantity: 7 },
        { sku: "VIE-002-1", quantity: 5 },
      ],
    });
    await handOver(order);
    await cardPaid(ctx, order.intent);
    await settle();

    const [issued] = await invoicesOf(order.id);
    expect(issued?.type).toBe("380");
    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: BILLABLE_INVOICE_ORDER_SELECT,
    });
    expect(row.discountCents).toBeGreaterThan(0);
    // Le BL remis porte ses parts de remise : la ventilation du livré est éprouvée.
    expect(row.deliveryNotes.flatMap((note) => note.discounts).length).toBeGreaterThan(0);

    const delivered = await ctx.app.get(CardInvoicingReader).candidate(order.id);
    if (delivered === null || delivered.billableCents === null) {
      throw new TypeError("La commande remise devait être soldée.");
    }
    // L'ancienne lecture : les totaux de la COMMANDE, jugés au total commandé.
    const ordered = {
      ...delivered,
      frozen: toFrozenInvoiceOrder(row),
      billableCents: delivered.totalCents,
      invoiced: false,
    };
    const xmlOf = async (candidate: typeof delivered) => {
      const prepared = await prepareCardInvoice(
        {
          creditors: ctx.app.get(CreditorReader),
          issuers: ctx.app.get(InvoiceIssuersReader),
          buyers: ctx.app.get(StatementBuyerReader),
        },
        { ...candidate, invoiced: false },
        "inv_neutral",
        new Date(daysAgo(0)),
      );
      if (prepared.kind !== "ready") {
        throw new TypeError(prepared.message);
      }
      // Numéro, identifiant et date d'émission neutralisés : les mêmes des deux côtés.
      const number = InvoiceNumber.compose("LFD", Number(prepared.issuedOn.slice(0, 4)), 1);
      return renderFacturXml(prepared.draft(number));
    };

    expect(await xmlOf(delivered)).toBe(await xmlOf(ordered));
    expect(issued?.totalTtcCents).toBe(delivered.billableCents);
  });
});
