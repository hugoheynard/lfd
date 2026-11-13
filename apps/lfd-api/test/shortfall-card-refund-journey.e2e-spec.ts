/**
 * E2E du **reste d'une carte remboursé au solde, jusqu'au client et à la
 * facture** (plan `documentation/commandes/reliquat/plan-e9-reste-carte.md`,
 * lots E9a et E9b, § 6, § 7 et § 9).
 *
 * Ce que seul le vrai SQL prouve, le prestataire et le transport des e-mails
 * doublés : la demande part au bon montant (encaissé − facturable) ; le
 * client n'apprend le montant qu'au succès du prestataire, une fois ; la
 * facture d'un pro attend que l'argent tombe juste, puis part sur le livré,
 * sans avoir, son Factur-X cohérent ; « Relancer » et « Réglé autrement »
 * mènent à la même facture, le second sans courriel ; un rejeu du solde ne
 * redemande rien ; un particulier est remboursé sans facture.
 */
import type { AdminShortfallLetterDraft } from "@lfd/contracts";

import { InvoiceReader } from "../src/lafoliecoffee/accounting/domain/ports/invoice.reader.js";
import { facturXArithmeticViolations } from "../src/lafoliecoffee/accounting/domain/services/facturx-arithmetic.js";
import { renderFacturXml } from "../src/lafoliecoffee/accounting/domain/services/facturx-xml.js";
import { REFUND_SHORTFALL_ON_BILLING_SETTLED } from "../src/lafoliecoffee/orders/application/handlers/refund-shortfall-on-billing-settled.handler.js";
import { SEND_SHORTFALL_REFUNDED_MAIL } from "../src/lafoliecoffee/orders/application/handlers/send-shortfall-refunded-mail.handler.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { STAFF } from "./production-day-fixture.js";
import {
  billableOf,
  bootShortfallCardScene,
  type CapturingMailer,
  departIncomplete,
  paidCardShortfall,
  refundSettles,
  relayAll,
  resetScene,
  type ScriptedRefunds,
  shortfallRequests,
} from "./shortfall-card-refund-scene.js";
import { invoicesOf, invoicingEntity } from "./shortfall-card-refund-invoicing.js";

const REFUNDED_MAIL = "customer.order-shortfall-refunded";

let ctx: E2eContext;
let issued: string[];
let mailer: CapturingMailer;
let refunds: ScriptedRefunds;

beforeAll(async () => {
  ({ ctx, issued, mailer, refunds } = await bootShortfallCardScene());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetScene(ctx, mailer, refunds);
});

/** La seule demande du reste, et ce qu'elle doit annoncer. */
async function theShortfallRequest(orderId: string) {
  const { requests, chargedCents } = await shortfallRequests(ctx, orderId);
  expect(requests).toHaveLength(1);
  const [request] = requests;
  if (request === undefined) {
    throw new TypeError("La demande du reste manque.");
  }
  return { request, expectedCents: chargedCents - (await billableOf(ctx, orderId)) };
}

/** La ligne au carnet d'un `re_…` — son id est la clé du courriel. */
async function ledgerLineOf(providerRef: string): Promise<string> {
  const line = await ctx.prisma.cardRefund.findFirstOrThrow({ where: { providerRef } });
  return line.id;
}

/** Rejoue un abonné sur tous ses faits, comme une relivraison de la boîte d'envoi. */
async function redeliver(subscriber: string): Promise<number> {
  const { count } = await ctx.prisma.outboxDelivery.updateMany({
    where: { subscriber },
    data: { deliveredAt: null, attempts: 0, claimedUntil: null, nextAttemptAt: new Date(0) },
  });
  await relayAll(ctx);
  return count;
}

/** La facture carte du livré : une 380, au facturable, sans avoir, son Factur-X juste. */
async function expectDeliveredInvoice(orderId: string): Promise<void> {
  const invoices = await invoicesOf(ctx, orderId);
  expect(invoices.map((invoice) => invoice.type)).toEqual(["380"]);
  const [row] = invoices;
  expect(row?.totalTtcCents).toBe(await billableOf(ctx, orderId));
  const invoice = await ctx.app.get(InvoiceReader).byId(row?.id ?? "");
  if (invoice === null) {
    throw new TypeError("La facture émise devait se relire.");
  }
  expect(facturXArithmeticViolations(renderFacturXml(invoice))).toEqual([]);
}

describe("le parcours d'un pro payé par carte, parti incomplet (plan E9)", () => {
  it("demande le reste exact, l'écrit au client au succès, puis facture le livré sans avoir", async () => {
    await invoicingEntity(ctx);
    const order = await paidCardShortfall(ctx, issued, "pro");
    await departIncomplete(ctx, order);

    const { request, expectedCents } = await theShortfallRequest(order.id);
    expect(expectedCents).toBeGreaterThan(0);
    expect(request).toMatchObject({
      form: "amount",
      nature: "adjustment",
      announcedCents: expectedCents,
      state: "issued",
    });
    const refund = refunds.forRequest(request.id);
    expect(refund.amountCents).toBe(expectedCents);
    // Demandé, pas rendu : ni montant au client, ni facture.
    expect(mailer.of(REFUNDED_MAIL)).toEqual([]);
    expect(await invoicesOf(ctx, order.id)).toEqual([]);

    await refundSettles(ctx, refund);

    expect(mailer.of(REFUNDED_MAIL)).toEqual([
      {
        template: REFUNDED_MAIL,
        key: `${REFUNDED_MAIL}:${await ledgerLineOf(refund.refundId)}`,
        data: { reference: order.orderNumber, amountCents: expectedCents, locale: "fr" },
      },
    ]);
    await expectDeliveredInvoice(order.id);

    // Relivrés : ni seconde demande, ni second courriel.
    expect(await redeliver(REFUND_SHORTFALL_ON_BILLING_SETTLED)).toBe(1);
    expect(await redeliver(SEND_SHORTFALL_REFUNDED_MAIL)).toBeGreaterThan(0);
    expect((await shortfallRequests(ctx, order.id)).requests).toHaveLength(1);
    expect(mailer.of(REFUNDED_MAIL)).toHaveLength(1);
  });

  it("le prestataire refuse : arrêtée, pas de facture ; « Relancer » rend, la facture part", async () => {
    await invoicingEntity(ctx);
    refunds.script.push({ kind: "declined" });
    const order = await paidCardShortfall(ctx, issued, "pro");
    await departIncomplete(ctx, order);

    const { request, expectedCents } = await theShortfallRequest(order.id);
    expect(request.state).toBe("stopped");
    expect(refunds.issued).toEqual([]);
    expect(await invoicesOf(ctx, order.id)).toEqual([]);

    await ctx
      .asSub(STAFF)
      .post(`/admin/card-payments/refund-requests/${request.id}/retry`)
      .set(INTENT_KEY, freshIntent())
      .expect(202);
    await ctx.drain();
    const refund = refunds.forRequest(request.id);
    expect(refund).toMatchObject({ generation: 2, amountCents: expectedCents });

    await refundSettles(ctx, refund);

    expect(mailer.of(REFUNDED_MAIL).map((mail) => mail.data)).toEqual([
      { reference: order.orderNumber, amountCents: expectedCents, locale: "fr" },
    ]);
    await expectDeliveredInvoice(order.id);
  });

  it("le prestataire refuse : « Réglé autrement » facture, sans courriel ni seconde demande au rejeu", async () => {
    await invoicingEntity(ctx);
    refunds.script.push({ kind: "declined" });
    const order = await paidCardShortfall(ctx, issued, "pro");
    await departIncomplete(ctx, order);
    const { request } = await theShortfallRequest(order.id);

    await ctx
      .asSub(STAFF)
      .post(`/admin/card-payments/refund-requests/${request.id}/settle-elsewhere`)
      .send({ reason: "Rendu par virement" })
      .expect(204);
    await relayAll(ctx);

    expect(mailer.of(REFUNDED_MAIL)).toEqual([]);
    await expectDeliveredInvoice(order.id);
    const { requests } = await shortfallRequests(ctx, order.id);
    expect(requests.map((row) => row.state)).toEqual(["settled_elsewhere"]);

    // Le solde rejoué : la demande réglée autrement gèle et retranche, rien n'est redemandé.
    expect(await redeliver(REFUND_SHORTFALL_ON_BILLING_SETTLED)).toBe(1);
    expect((await shortfallRequests(ctx, order.id)).requests).toHaveLength(1);
    expect(mailer.of(REFUNDED_MAIL)).toEqual([]);
  });
});

describe("le parcours d'un particulier payé par carte (plan E9)", () => {
  it("prévenu que le reste sera rendu, remboursé, prévenu du montant, sans facture", async () => {
    const order = await paidCardShortfall(ctx, issued, "individual");
    await departIncomplete(ctx, order);
    const draft = jsonBody<AdminShortfallLetterDraft>(
      await ctx.asSub(STAFF).get(`/admin/orders/${order.id}/shortfall-letter`).expect(200),
    );
    // La proposition « Écrire au client » le dit, sans montant (§ 7).
    expect(draft.message).toContain("Le reste vous sera remboursé sur votre carte.");
    const { request, expectedCents } = await theShortfallRequest(order.id);

    await refundSettles(ctx, refunds.forRequest(request.id));

    expect(mailer.of(REFUNDED_MAIL).map((mail) => mail.data)).toEqual([
      { reference: order.orderNumber, amountCents: expectedCents, locale: "fr" },
    ]);
    expect(await invoicesOf(ctx, order.id)).toEqual([]);
  });
});
