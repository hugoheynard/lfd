/**
 * E2E de **`public.refund_credit` : un avoir ne constate qu'un remboursement**
 * (`documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §5.1). L'unicité de `credit_note_id` ne s'éprouve qu'avec un avoir réel —
 * une pièce émise par l'émetteur de factures — d'où ce fichier à part de
 * `card-refund-schema.e2e-spec.ts`, qui écrit ses lignes en SQL brut.
 *
 * Frontières doublées : la signature du jeton staff, les polices du PDF.
 */
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
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

class NoFonts extends InvoiceFontSource {
  load(): Promise<InvoicePdfFonts> {
    return Promise.reject(new InvoiceFontsUnavailableError("fonts (suite refund_credit)", null));
  }
}

let ctx: E2eContext;

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

/** Une pièce réellement émise, que `credit_note_id` peut viser. */
async function anIssuedPiece(): Promise<string> {
  const declared = await ctx
    .asSub("staff-e2e")
    .post("/admin/accounting/legal-entities")
    .set(INTENT_KEY, freshIntent())
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
          id: "inv_refund_credit",
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
          orders: [{ orderId: "o_refund_credit", reference: "ORD-RC", receivedOn: issuedOn }],
        }),
      ),
  });
  return invoice.id;
}

describe("public.refund_credit — un avoir, un seul remboursement", () => {
  it("refuse un second remboursement rattaché au même avoir", async () => {
    const creditNoteId = await anIssuedPiece();
    await ctx.prisma.$executeRaw`
      INSERT INTO "public"."refund_credit" ("refund_id", "credit_note_id", "reason", "created_at")
      VALUES ('rfd_premier', ${creditNoteId}, 'credit_note', now())`;

    await expect(
      ctx.prisma.$executeRaw`
        INSERT INTO "public"."refund_credit" ("refund_id", "credit_note_id", "reason", "created_at")
        VALUES ('rfd_autre', ${creditNoteId}, 'credit_note', now())`,
    ).rejects.toThrow(/refund_credit_credit_note_id_key|Unique constraint/);
    expect(await ctx.prisma.refundCredit.count({ where: { creditNoteId } })).toBe(1);
  });
});
