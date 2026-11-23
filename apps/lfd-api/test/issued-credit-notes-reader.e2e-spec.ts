/**
 * E2E de **la lecture des avoirs émis** — `IssuedCreditNotesReader`, publiée
 * par la comptabilité pour l'export des ventes (lot E0 de
 * `documentation/commandes/export/plan-export-des-ventes.md`, § 3.4).
 *
 * Ce que seul le vrai SQL prouve : la période se lit sur `issued_on`, seuls
 * les avoirs (381) sortent — pas la facture qu'ils corrigent —, avec leurs
 * montants figés et les commandes qu'ils nomment. La facture du mois et
 * l'avoir passent par la vraie émission (`InvoiceIssuer`), le bon par le
 * vrai chemin (plan T) ; mandat et rattachements sont écrits par Prisma,
 * même dette que `issued-invoices.e2e-spec.ts`, dont la mise en place est
 * reprise. Aucune date absolue : le mois est le précédent du jour du test.
 */
import { addDays } from "@lfd/contracts";
import { invoiceVatBreakdown } from "@lfd/money";

import { InvoiceIssuer } from "../src/lafoliecoffee/accounting/application/services/invoice-issuer.js";
import { Invoice } from "../src/lafoliecoffee/accounting/domain/entities/invoice.js";
import { InvoiceReader } from "../src/lafoliecoffee/accounting/domain/ports/invoice.reader.js";
import { IssuedCreditNotesReader } from "../src/lafoliecoffee/accounting/domain/ports/issued-credit-notes.reader.js";
import { invoicingMomentOf } from "../src/lafoliecoffee/accounting/domain/services/invoicing-closures.js";
import { StatementMonth } from "../src/lafoliecoffee/accounting/domain/value-objects/statement-month.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { addBillingAddress, attachTo, createCompany, createUser, handOver } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { placeServedOrder, type ServedOrder } from "./served-order.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ENTITIES = "/admin/accounting/legal-entities";
const MONTHLY = "/admin/accounting/monthly-invoices";
const RIB = {
  iban: "FR7630004000031234567890143",
  bic: "BNPAFRPP",
  holder: "Client e2e",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

const clock = new FixedClock(new Date());
let ctx: E2eContext;
let closesAt: Date;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: Clock, value: clock },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const month = StatementMonth.containing(new Date(daysAgo(0))).previous();
  closesAt = month.cycle().closesAt;
  clock.set(new Date(invoicingMomentOf(closesAt).getTime() + 5 * 60 * 1000));
  const startsAt = month.cycle().startsAt;
  await ctx.prisma.collectionFloor.create({ data: { id: true, floorAt: startsAt } });
  await ctx.prisma.invoicingFloor.create({ data: { id: true, floorAt: startsAt } });
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

/** L'entité, complète, mentions de facture et préfixe posés. */
async function entity(): Promise<string> {
  const response = await staff()
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
    .expect(201);
  const id = jsonBody<{ id: string }>(response).id;
  await staff()
    .put(`${ENTITIES}/${id}/creditor-identifier`)
    .send({ ics: "FR72ZZZ123456" })
    .expect(204);
  await staff()
    .put(`${ENTITIES}/${id}/creditor-account`)
    .send({ ...RIB, iban: "FR1420041010050500013M02606", holder: "La Folie Douce" })
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
  return id;
}

/** Un payeur au compte, mandat actif, et un bon servi avant la clôture. */
async function payerWithOrder(entityId: string): Promise<{
  readonly companyId: string;
  readonly order: ServedOrder;
}> {
  const company = await createCompany(ctx.prisma, { raisonSociale: "Groupe Avoir" });
  await addBillingAddress(ctx.prisma, company.id);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { vatNumber: "FR40303265045", grantedTerms: ["monthly"] },
  });
  await staff().put(`/admin/companies/${company.id}/bank-account`).send(RIB).expect(204);
  await ctx.prisma.paymentMandate.create({
    data: {
      companyId: company.id,
      creditorId: entityId,
      reference: "RUM-EXPORT-1",
      status: "active",
      acceptedAt: new Date(closesAt.getTime() - 60 * DAY_MS),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
  const owner = await createUser(ctx.prisma, { auth0Sub: "export-avoir", email: "p@avoir.test" });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  const servedAt = new Date(closesAt.getTime() - 2 * DAY_MS);
  const order = await placeServedOrder(ctx, {
    buyerUserId: owner.id,
    companyId: company.id,
    servedAt,
  });
  await handOver(ctx.prisma, { ...order, createdAt: servedAt });
  return { companyId: company.id, order };
}

/** La facture du mois du payeur, émise par la vraie route, puis un avoir qui nomme son bon. */
async function creditNoteOn(entityId: string, companyId: string): Promise<Invoice> {
  await staff()
    .post(MONTHLY)
    .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
    .expect(200);
  await ctx.drain();
  const stored = await ctx.prisma.invoice.findFirstOrThrow({
    where: { payerCompanyId: companyId },
  });
  const corrected = await ctx.app.get(InvoiceReader).byId(stored.id);
  if (corrected === null) {
    throw new Error("La facture du mois vient d'être émise : elle doit se relire.");
  }
  const state = corrected.toState();
  const [first] = state.lines;
  const lines = first === undefined ? [] : [{ ...first, amountCents: 100 }];
  const note = await ctx.app.get(InvoiceIssuer).issue({
    legalEntityId: entityId,
    issuedOn: state.issuedOn,
    draft: (number) =>
      Invoice.creditNote({
        id: "cn_export",
        number,
        issuedOn: state.issuedOn,
        corrected,
        priorCreditNotes: [],
        orders: state.orders,
        lines,
        vat: invoiceVatBreakdown({
          goods: lines.map((line) => ({ htCents: line.amountCents, vatRate: line.vatRate })),
          allowances: [],
          charges: [],
        }),
      }),
  });
  await ctx.drain();
  return note;
}

describe("IssuedCreditNotesReader — les avoirs émis d'une période", () => {
  it("rend l'avoir du jour, ses montants figés et la commande qu'il nomme — pas la facture", async () => {
    const entityId = await entity();
    const { companyId, order } = await payerWithOrder(entityId);
    const note = await creditNoteOn(entityId, companyId);
    const { issuedOn } = note.toState();
    const stored = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: note.id } });

    const notes = await ctx.app.get(IssuedCreditNotesReader).issuedBetween(issuedOn, issuedOn);

    expect(notes).toEqual([
      {
        number: note.number,
        issuedOn,
        payerCompanyId: companyId,
        totalHtCents: stored.totalHtCents,
        totalVatCents: stored.totalVatCents,
        totalTtcCents: stored.totalTtcCents,
        orderNumbers: [order.orderNumber],
      },
    ]);
    expect(stored.totalHtCents).toBe(100);
  });

  it("borne la période sur le jour d'émission", async () => {
    const entityId = await entity();
    const { companyId } = await payerWithOrder(entityId);
    const note = await creditNoteOn(entityId, companyId);
    const { issuedOn } = note.toState();
    const reader = ctx.app.get(IssuedCreditNotesReader);

    expect(await reader.issuedBetween(addDays(issuedOn, -3), addDays(issuedOn, -1))).toEqual([]);
    expect(await reader.issuedBetween(addDays(issuedOn, 1), addDays(issuedOn, 3))).toEqual([]);
  });
});
