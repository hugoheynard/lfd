/**
 * E2E de **la facture carte et de l'avoir des remboursements** (lots E5a et
 * E5b du plan `documentation/comptabilite/facturation/plan-facture-carte-et-remboursements.md`).
 *
 * Ce que seul le vrai SQL prouve :
 * - les deux déclencheurs durables (`order.fulfilled`, `order.paid`) relayés
 *   par la vraie boîte d'envoi, dans les deux ordres ; une seule facture ;
 * - la facture acquittée écrite (`prepaid_cents`, `paid_on`, moyen 48) et
 *   relue ; l'issue `card_invoice_outcome` ;
 * - les avoirs d'un partiel puis du reste, liés par `order_refund.credit_note_id`,
 *   dont la somme égale la facture au centime ;
 * - une facture impossible signalée, puis émise par « Réessayer » ;
 * - le critère de la facture du mois n'attrape jamais une commande carte, et
 *   une commande au compte n'a jamais de facture carte.
 *
 * Les commandes sont semées par Prisma, faute d'agrégat qui sache écrire une
 * commande à un état donné (même dette que `test/factories.ts`). Le retrait,
 * l'encaissement et le remboursement passent par les VRAIES commandes du bus.
 */
import { CommandBus } from "@nestjs/cqrs";

import { billableOrderWhere } from "../src/b2b/accounting/infrastructure/billable-order-criterion.js";
import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import { MarkOrderFulfilledCommand } from "../src/b2b/orders/application/commands/mark-order-fulfilled.command.js";
import { RecordOrderRefundCommand } from "../src/b2b/orders/application/commands/record-order-refund.command.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole, OrderClientele } from "../src/platform/database/client/client.js";
import { OutboxRelay } from "../src/platform/outbox/outbox-relay.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const ENTITIES = "/admin/accounting/legal-entities";
const TOTAL = 1_055;
const STAFF = "staff-e2e";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: STAFF, scopes: [] }),
};

let ctx: E2eContext;
let seq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  seq = 0;
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub(STAFF);
}

/** Les faits durables en chaîne (paiement → facture → PDF) : quelques passes du relais. */
async function settle(): Promise<void> {
  const relay = ctx.app.get(OutboxRelay);
  for (let round = 0; round < 4; round += 1) {
    await relay.sweep();
    await ctx.drain();
  }
}

/** L'entité émettrice, complète, mentions de la facture posées. */
async function entity(): Promise<void> {
  const response = await staff()
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
    .expect(201);
  const id = jsonBody<{ id: string }>(response).id;
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
}

interface Seeded {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly intent: string;
  readonly companyId: string;
}

/** Une commande pro, carte attendue ou au compte ; la société avec ou sans TVA. */
async function proOrder(
  options: { readonly account?: boolean; readonly vatNumber?: string } = {},
): Promise<Seeded> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: `Boulangerie ${String(seq)}` });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { vatNumber: options.vatNumber ?? "FR40303265045" },
  });
  const owner = await createUser(ctx.prisma, { auth0Sub: `e5-owner-${String(seq)}` });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  const orderNumber = `CMD-E5-${String(seq)}`;
  const intent = `pi_e5_${String(seq)}`;
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber,
      companyId: company.id,
      clientele: OrderClientele.pro,
      placedByUserId: owner.id,
      subtotalCents: 1_000,
      totalCents: TOTAL,
      vatCents: 55,
      paymentStatus: options.account === true ? "not_required" : "pending",
      ...(options.account === true ? {} : { stripePaymentIntentId: intent }),
      createdAt: new Date(daysAgo(1)),
      vatShares: [{ rate: 5.5, amountCents: 55 }],
      lines: {
        create: {
          sku: "PAIN-E5",
          productNameSnapshot: "Pain de la carte",
          unitPriceMillicents: 1_000_000,
          vatRate: 5.5,
          quantity: 1,
          lineTotalCents: 1_000,
        },
      },
    },
    select: { id: true },
  });
  return { orderId: order.id, orderNumber, intent, companyId: company.id };
}

async function handOver(order: Seeded): Promise<void> {
  await ctx.app
    .get(CommandBus)
    .execute(
      new MarkOrderFulfilledCommand(order.orderNumber, STAFF, new Date(daysAgo(0)), "manual"),
    );
  await settle();
}

async function pay(order: Seeded): Promise<void> {
  await ctx.app.get(CommandBus).execute(new ConfirmOrderPaymentCommand(order.intent, "succeeded"));
  await settle();
}

async function refund(order: Seeded, id: string, amountCents: number): Promise<void> {
  await ctx.app.get(CommandBus).execute(
    new RecordOrderRefundCommand(order.intent, {
      stripeRefundId: id,
      amountCents,
      currency: "eur",
      status: "succeeded",
      refundedAt: new Date(daysAgo(0)),
    }),
  );
  await settle();
}

function piecesOf(orderId: string) {
  return ctx.prisma.invoice.findMany({
    where: { orders: { some: { orderId } } },
    orderBy: [{ year: "asc" }, { rank: "asc" }],
  });
}

describe("la facture carte (E5a)", () => {
  it("retrait puis paiement : une facture acquittée, au moyen 48, et son issue", async () => {
    await entity();
    const order = await proOrder();

    await handOver(order);
    expect(await piecesOf(order.orderId)).toEqual([]);
    await pay(order);

    const [invoice, ...others] = await piecesOf(order.orderId);
    expect(others).toEqual([]);
    expect(invoice).toMatchObject({
      type: "380",
      payerCompanyId: order.companyId,
      totalTtcCents: TOTAL,
      prepaidCents: TOTAL,
      paymentMeans: { code: "48" },
    });
    const outcome = await ctx.prisma.cardInvoiceOutcome.findUniqueOrThrow({
      where: { orderId: order.orderId },
    });
    expect(outcome).toMatchObject({ outcome: "issued", invoiceId: invoice?.id });
    const detail = await staff()
      .get(`/admin/accounting/invoices/${invoice?.id ?? ""}`)
      .expect(200);
    expect(jsonBody<{ paidOn: string | null }>(detail).paidOn).not.toBeNull();
  });

  it("paiement puis retrait : la même facture, une seule, quel que soit le nombre de passes", async () => {
    await entity();
    const order = await proOrder();

    await pay(order);
    expect(await piecesOf(order.orderId)).toEqual([]);
    await handOver(order);
    await staff().post(`/admin/accounting/card-invoices/${order.orderId}/retry`).expect(200);

    const pieces = await piecesOf(order.orderId);
    expect(pieces.map((piece) => piece.type)).toEqual(["380"]);
  });

  it("une facture impossible est signalée, puis émise par « Réessayer » une fois la fiche corrigée", async () => {
    await entity();
    const order = await proOrder({ vatNumber: "" });

    await pay(order);
    await handOver(order);

    const signals = await staff().get("/admin/accounting/card-invoices/signals").expect(200);
    expect(jsonBody<{ signaled: { orderNumber: string }[] }>(signals).signaled).toEqual([
      expect.objectContaining({ orderNumber: order.orderNumber }),
    ]);
    expect(await piecesOf(order.orderId)).toEqual([]);

    await ctx.prisma.company.update({
      where: { id: order.companyId },
      data: { vatNumber: "FR40303265045" },
    });
    const retried = await staff()
      .post(`/admin/accounting/card-invoices/${order.orderId}/retry`)
      .expect(200);

    expect(jsonBody<{ outcome: string }>(retried).outcome).toBe("issued");
    const after = await staff().get("/admin/accounting/card-invoices/signals").expect(200);
    expect(jsonBody<{ signaled: unknown[] }>(after).signaled).toEqual([]);
  });
});

describe("l'avoir des remboursements (E5b)", () => {
  it("un partiel puis le reste : deux avoirs, liés, dont la somme égale la facture", async () => {
    await entity();
    const order = await proOrder();
    await pay(order);
    await handOver(order);

    await refund(order, "re_e5_1", 400);
    await refund(order, "re_e5_2", TOTAL - 400);

    const [invoice, ...notes] = await piecesOf(order.orderId);
    expect(notes.map((note) => [note.type, note.totalTtcCents])).toEqual([
      ["381", 400],
      ["381", TOTAL - 400],
    ]);
    const sum = (field: "totalHtCents" | "totalVatCents") =>
      notes.reduce((total, note) => total + note[field], 0);
    expect(sum("totalHtCents")).toBe(invoice?.totalHtCents);
    expect(sum("totalVatCents")).toBe(invoice?.totalVatCents);
    const links = await ctx.prisma.orderRefund.findMany({
      where: { orderId: order.orderId },
      orderBy: { recordedAt: "asc" },
      select: { creditNoteId: true },
    });
    expect(links.map((link) => link.creditNoteId)).toEqual(notes.map((note) => note.id));

    const listed = await staff()
      .get(`/admin/accounting/orders/${order.orderId}/invoices`)
      .expect(200);
    expect(jsonBody<{ invoices: { kind: string }[] }>(listed).invoices.map((i) => i.kind)).toEqual([
      "invoice",
      "credit_note",
      "credit_note",
    ]);
  });

  it("remboursée en totalité avant le retrait : aucune pièce", async () => {
    await entity();
    const order = await proOrder();
    await pay(order);
    await refund(order, "re_e5_total", TOTAL);
    await handOver(order);

    expect(await piecesOf(order.orderId)).toEqual([]);
  });
});

describe("la frontière avec la facture du mois", () => {
  it("une commande au compte n'a jamais de facture carte", async () => {
    await entity();
    const order = await proOrder({ account: true });

    await handOver(order);

    expect(await piecesOf(order.orderId)).toEqual([]);
    expect(await ctx.prisma.cardInvoiceOutcome.count()).toBe(0);
  });

  it("le critère de la facture du mois n'attrape jamais une commande carte", async () => {
    await entity();
    const card = await proOrder();
    const account = await proOrder({ account: true });
    await pay(card);
    await handOver(card);

    const window = billableOrderWhere(new Date(daysAgo(30)), new Date(daysAgo(-1)));
    const billable = await ctx.prisma.order.findMany({ where: window, select: { id: true } });

    expect(billable.map((row) => row.id)).toEqual([account.orderId]);
  });
});
