/**
 * **La copie des remboursements vers `card_payment`** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * lot P1, §5.2, règles (1) et (2), §5.1 pour `refund_credit`).
 *
 * La base de test est déjà migrée : la migration de copie — à part, sans DDL,
 * pour ça — est REJOUÉE ici, le fichier entier, sur des lignes semées par les
 * anciens modèles (`orderRefund*`, qui restent jusqu'à P2) et sur les
 * paiements `first` que la reprise de P0 aurait posés. Puis chaque ligne est
 * relue et comparée à la règle ÉCRITE, état par état.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { InvoiceIssuer } from "../src/lafoliecoffee/accounting/application/services/invoice-issuer.js";
import { Invoice } from "../src/lafoliecoffee/accounting/domain/entities/invoice.js";
import { issueInput } from "../src/lafoliecoffee/accounting/domain/entities/__tests__/invoice-fixtures.js";
import { InvoiceFontsUnavailableError } from "../src/lafoliecoffee/accounting/domain/errors/invoice-document-errors.js";
import {
  InvoiceFontSource,
  type InvoicePdfFonts,
} from "../src/lafoliecoffee/accounting/domain/ports/invoice-font-source.js";
import type { InvoiceNumber } from "../src/lafoliecoffee/accounting/domain/value-objects/invoice-number.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { LATEST_DELIVERY_FULFILLMENT } from "./delivery-deadline-fixture.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany, createUser } from "./factories.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20261110010200_la_copie_des_remboursements/migration.sql",
);

/** Le montant de chaque premier paiement semé — `total_cents` de la commande. */
const CHARGED_CENTS = 5_000;

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

class NoFonts extends InvoiceFontSource {
  load(): Promise<InvoicePdfFonts> {
    return Promise.reject(new InvoiceFontsUnavailableError("fonts (suite copie)", null));
  }
}

let ctx: E2eContext;
let sequence = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: InvoiceFontSource, value: new NoFonts() },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

async function replay(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(readFileSync(MIGRATION, "utf8"));
}

/** Une commande et son premier paiement, tels que P0 les laisse. */
async function anOrderPaid(withPayment = true): Promise<{ orderId: string; paymentId: string }> {
  sequence += 1;
  const tag = String(sequence);
  const company = await createCompany(ctx.prisma);
  const user = await createUser(ctx.prisma, { auth0Sub: `u_copy_${tag}` });
  const order = await ctx.prisma.order.create({
    data: {
      vatMethod: "line_ht",
      orderNumber: `ORD-97${tag.padStart(4, "0")}`,
      companyId: company.id,
      placedByUserId: user.id,
      status: "cancelled",
      fulfillment: LATEST_DELIVERY_FULFILLMENT,
      requestedDeliveryDate: new Date(`${daysAgo(2).slice(0, 10)}T00:00:00.000Z`),
      subtotalCents: CHARGED_CENTS,
      totalCents: CHARGED_CENTS,
    },
    select: { id: true },
  });
  const paymentId = `pay_copy_${tag}`;
  if (withPayment) {
    await ctx.prisma.$executeRaw`
      INSERT INTO "card_payment"."payment"
        ("id", "subject_type", "subject_id", "account", "provider_ref", "role",
         "amount_cents", "state", "created_at")
      VALUES (${paymentId}, 'order', ${order.id}, 'lfc-stripe', ${`pi_copy_${tag}`}, 'first',
              ${CHARGED_CENTS}, 'paid', now())`;
  }
  return { orderId: order.id, paymentId };
}

interface OldRequest {
  readonly stripeRefundId?: string | null;
  readonly nextAttemptAt?: Date | null;
  readonly generation?: number;
  readonly lastFailure?: string | null;
}

const REQUESTED_AT = new Date(daysAgo(3));
const ISSUED_AT = new Date(daysAgo(2));
const NEXT_ATTEMPT_AT = new Date(daysAgo(1));

async function oldRequest(orderId: string, seed: OldRequest = {}): Promise<void> {
  const stripeRefundId = seed.stripeRefundId ?? null;
  await ctx.prisma.orderRefundRequest.create({
    data: {
      orderId,
      cause: "cancellation",
      announcedCents: CHARGED_CENTS,
      requestedAt: REQUESTED_AT,
      requestedBy: "stf_copy",
      generation: seed.generation ?? 1,
      stripeRefundId,
      issuedAt: stripeRefundId === null ? null : ISSUED_AT,
      attempts: stripeRefundId === null ? 0 : 1,
      lastFailure: seed.lastFailure ?? null,
      round: 2,
      nextAttemptAt: seed.nextAttemptAt === undefined ? NEXT_ATTEMPT_AT : seed.nextAttemptAt,
    },
  });
}

const REFUNDED_AT = new Date(daysAgo(2));
const RECORDED_AT = new Date(daysAgo(1));

async function oldRefund(
  orderId: string,
  stripeRefundId: string,
  status: "pending" | "succeeded" | "failed",
  amountCents = CHARGED_CENTS,
  creditNoteId: string | null = null,
): Promise<string> {
  sequence += 1;
  const id = `rfd_copy_${String(sequence)}`;
  await ctx.prisma.orderRefund.create({
    data: {
      id,
      orderId,
      stripeRefundId,
      amountCents,
      currency: "eur",
      status,
      refundedAt: REFUNDED_AT,
      recordedAt: RECORDED_AT,
      updatedAt: RECORDED_AT,
      creditNoteId,
    },
  });
  return id;
}

/** Un avoir réel : la clé `credit_note_id` vise une pièce émise. */
async function aCreditNote(): Promise<string> {
  const declared = await ctx
    .asSub("staff-e2e")
    .post("/admin/accounting/legal-entities")
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: "552100554",
      rcs: "Chambéry B 552100554",
      shareCapitalCents: 1_000_000,
      vatNumber: "",
      address: {
        line1: "12 rue du Fournil",
        line2: "",
        postalCode: "73000",
        city: "Chambéry",
        countryCode: "FR",
      },
    })
    .expect(201);
  const entityId = jsonBody<{ id: string }>(declared).id;
  await ctx
    .asSub("staff-e2e")
    .put(`/admin/accounting/legal-entities/${entityId}/invoice-prefix`)
    .send({ prefix: "LFD" })
    .expect(204);
  const issuedOn = daysAgo(1).slice(0, 10);
  const base = issueInput();
  const invoice = await ctx.app.get(InvoiceIssuer).issue({
    legalEntityId: entityId,
    issuedOn,
    draft: (number: InvoiceNumber) =>
      Invoice.issue(
        issueInput({
          id: "inv_copy",
          number,
          issuedOn,
          dueOn: daysAgo(-13).slice(0, 10),
          seller: { ...base.seller, legalEntityId: entityId },
          ...(base.sellerFacts === null
            ? {}
            : {
                sellerFacts: {
                  ...base.sellerFacts,
                  legalEntityId: entityId,
                  invoicePrefix: number.prefix,
                },
              }),
          orders: [{ orderId: "o_copy", reference: "ORD-COPY", receivedOn: issuedOn }],
        }),
      ),
  });
  return invoice.id;
}

function requestOf(id: string) {
  return ctx.prisma.cardRefundRequest.findUniqueOrThrow({ where: { id } });
}

describe("la copie des demandes — règle (2), état par état", () => {
  it("(a) re_… succeeded ⇒ refunded, tout le reste recopié", async () => {
    const { orderId, paymentId } = await anOrderPaid();
    await oldRequest(orderId, { stripeRefundId: "re_a" });
    await oldRefund(orderId, "re_a", "succeeded");

    await replay();

    expect(await requestOf(orderId)).toEqual({
      id: orderId,
      paymentId,
      form: "remainder",
      amountCents: null,
      nature: "return",
      reason: "cancellation",
      state: "refunded",
      announcedCents: CHARGED_CENTS,
      issuedCents: CHARGED_CENTS,
      requestedAt: REQUESTED_AT,
      requestedBy: "stf_copy",
      generation: 1,
      round: 2,
      attempts: 1,
      providerRef: "re_a",
      issuedAt: ISSUED_AT,
      lastFailure: null,
      lastAttemptAt: null,
      claimedUntil: null,
      claimToken: null,
      nextAttemptAt: NEXT_ATTEMPT_AT,
      settledByStaffId: null,
      settledReason: null,
    });
  });

  it("(a) pas de re_… mais le paiement est sans reste ⇒ refunded", async () => {
    const { orderId } = await anOrderPaid();
    await oldRequest(orderId);
    await oldRefund(orderId, "re_hors_plateforme", "succeeded");

    await replay();

    expect(await requestOf(orderId)).toMatchObject({ state: "refunded", providerRef: null });
  });

  it("(b) re_… failed ⇒ stopped, son montant gardé comme émis", async () => {
    const { orderId } = await anOrderPaid();
    await oldRequest(orderId, { stripeRefundId: "re_b", lastFailure: "declined:expired_card" });
    await oldRefund(orderId, "re_b", "failed", 4_000);

    await replay();

    expect(await requestOf(orderId)).toMatchObject({
      state: "stopped",
      providerRef: "re_b",
      issuedCents: 4_000,
      lastFailure: "declined:expired_card",
    });
  });

  it("(b) pas de re_… et pas d'échéance, un reste ⇒ stopped (elle attend le bouton)", async () => {
    const { orderId } = await anOrderPaid();
    await oldRequest(orderId, { nextAttemptAt: null });

    await replay();

    expect(await requestOf(orderId)).toMatchObject({ state: "stopped", nextAttemptAt: null });
  });

  it("(c) re_… posé mais absent du carnet ⇒ issued, sans montant émis connu", async () => {
    const { orderId } = await anOrderPaid();
    await oldRequest(orderId, { stripeRefundId: "re_c" });

    await replay();

    expect(await requestOf(orderId)).toMatchObject({
      state: "issued",
      providerRef: "re_c",
      issuedCents: null,
    });
  });

  it("(c) re_… vivant au carnet ⇒ issued", async () => {
    const { orderId } = await anOrderPaid();
    await oldRequest(orderId, { stripeRefundId: "re_c2" });
    await oldRefund(orderId, "re_c2", "pending");

    await replay();

    expect(await requestOf(orderId)).toMatchObject({ state: "issued", issuedCents: CHARGED_CENTS });
  });

  it("(d) pas de re_…, une échéance, un reste ⇒ to_issue, l'échéance conservée", async () => {
    const { orderId } = await anOrderPaid();
    await oldRequest(orderId);
    await oldRefund(orderId, "re_partiel", "succeeded", 1_000);

    await replay();

    expect(await requestOf(orderId)).toMatchObject({
      state: "to_issue",
      nextAttemptAt: NEXT_ATTEMPT_AT,
      providerRef: null,
    });
  });
});

describe("la copie du carnet — règle (1)", () => {
  it("le re_… de la demande est rattaché à elle, nature return ; un re_… manuel ne l'est pas", async () => {
    const { orderId, paymentId } = await anOrderPaid();
    await oldRequest(orderId, { stripeRefundId: "re_demande" });
    const own = await oldRefund(orderId, "re_demande", "succeeded", 3_000);
    const manual = await oldRefund(orderId, "re_manuel", "succeeded", 2_000);

    await replay();

    const lines = await ctx.prisma.cardRefund.findMany({ orderBy: { id: "asc" } });
    expect(lines).toEqual(
      [
        {
          id: own,
          paymentId,
          account: "lfc-stripe",
          requestId: orderId,
          nature: "return",
          source: "provider",
          providerRef: "re_demande",
          amountCents: 3_000,
          currency: "eur",
          status: "succeeded",
          refundedAt: REFUNDED_AT,
          recordedAt: RECORDED_AT,
          updatedAt: RECORDED_AT,
        },
        {
          id: manual,
          paymentId,
          account: "lfc-stripe",
          requestId: null,
          nature: null,
          source: "provider",
          providerRef: "re_manuel",
          amountCents: 2_000,
          currency: "eur",
          status: "succeeded",
          refundedAt: REFUNDED_AT,
          recordedAt: RECORDED_AT,
          updatedAt: RECORDED_AT,
        },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );
  });

  it("le lien vers l'avoir passe à refund_credit, et un second avoir y est impossible", async () => {
    const creditNoteId = await aCreditNote();
    const { orderId } = await anOrderPaid();
    await oldRequest(orderId, { stripeRefundId: "re_avoir" });
    const refundId = await oldRefund(orderId, "re_avoir", "succeeded", CHARGED_CENTS, creditNoteId);
    const issued = await ctx.prisma.invoice.findUniqueOrThrow({
      where: { id: creditNoteId },
      select: { createdAt: true },
    });

    await replay();

    expect(await ctx.prisma.refundCredit.findMany()).toEqual([
      { refundId, creditNoteId, reason: "credit_note", createdAt: issued.createdAt },
    ]);
    await expect(
      ctx.prisma.$executeRaw`
        INSERT INTO "public"."refund_credit" ("refund_id", "credit_note_id", "reason", "created_at")
        VALUES ('rfd_autre', ${creditNoteId}, 'credit_note', now())`,
    ).rejects.toThrow(/refund_credit_credit_note_id_key|Unique constraint/);
  });
});

describe("la copie — rejouable, témoin, et refus d'une ligne sans paiement", () => {
  it("rejouée, elle n'écrit aucun doublon, et pose le témoin P1 une fois", async () => {
    const { orderId } = await anOrderPaid();
    await oldRequest(orderId, { stripeRefundId: "re_rejeu" });
    await oldRefund(orderId, "re_rejeu", "succeeded");

    await replay();
    await replay();

    expect(await ctx.prisma.cardRefundRequest.count()).toBe(1);
    expect(await ctx.prisma.cardRefund.count()).toBe(1);
    expect(
      await ctx.prisma.cardPaymentTakeover.findMany({
        where: { lot: "P1" },
        select: { lot: true },
      }),
    ).toEqual([{ lot: "P1" }]);
  });

  it("une demande sans premier paiement fait échouer la copie entière, sans rien écrire", async () => {
    const { orderId } = await anOrderPaid(false);
    await oldRequest(orderId);
    const paid = await anOrderPaid();
    await oldRequest(paid.orderId, { stripeRefundId: "re_ok" });
    await oldRefund(paid.orderId, "re_ok", "succeeded");

    await expect(replay()).rejects.toThrow(/payment_id/);

    expect(await ctx.prisma.cardRefundRequest.count()).toBe(0);
    expect(await ctx.prisma.cardRefund.count()).toBe(0);
    expect(await ctx.prisma.cardPaymentTakeover.count({ where: { lot: "P1" } })).toBe(0);
  });
});
