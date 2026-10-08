/**
 * E2E des **factures émises, côté destinataires** (plan
 * `documentation/comptabilite/facturation/plan-emission-de-la-facture.md`, lot E6).
 *
 * Ce que seul le vrai SQL prouve : l'émission écrit son fait durable dans
 * la transaction du numéro ; « Votre facture » part, au bon montant, au
 * contact de facturation du payeur ET aux rôles facturation des sous-comptes
 * dont des bons figurent sur la facture, dédoublonné ; « Mes factures » est
 * muré (non-membre 404, autre rôle 403, pièce d'un autre 404) ; la fiche et
 * la comptabilité lisent les pièces.
 *
 * 🔴 Aucun courriel ne part : le mailer est un double qui enregistre.
 *
 * ⚠️ Commandes, mandats, rattachements : écrits par Prisma, même dette que
 * `monthly-invoices.e2e-spec.ts`. Aucune date absolue : le mois est le
 * PRÉCÉDENT du jour du test, l'horloge FIXE est posée relativement à lui.
 */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import type { IssuedInvoiceView, IssuedInvoicesView } from "@lfd/contracts";
import { invoiceVatBreakdown } from "@lfd/money";
import type { SendMailArgs } from "@lfd/mailer";

import { InvoiceIssuer } from "../src/b2b/accounting/application/services/invoice-issuer.js";
import { Invoice } from "../src/b2b/accounting/domain/entities/invoice.js";
import { InvoiceReader } from "../src/b2b/accounting/domain/ports/invoice.reader.js";
import { invoicingMomentOf } from "../src/b2b/accounting/domain/services/monthly-invoicing.js";
import { noticeAmount } from "../src/b2b/accounting/domain/services/collection-notice-wording.js";
import { StatementMonth } from "../src/b2b/accounting/domain/value-objects/statement-month.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import type { B2bMails } from "../src/platform/mailer/mail-templates.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ICS = "FR72ZZZ123456";
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
const ENTITIES = "/admin/accounting/legal-entities";
const MONTHLY = "/admin/accounting/monthly-invoices";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

type SentMail = SendMailArgs<B2bMails>;
const sentMails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

const clock = new FixedClock(new Date());
let ctx: E2eContext;
let seq = 0;
let month: StatementMonth;
let closesAt: Date;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MAILER, value: recordingMailer },
      { token: Clock, value: clock },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  sentMails.splice(0);
  seq = 0;
  month = StatementMonth.containing(new Date(daysAgo(0))).previous();
  closesAt = month.cycle().closesAt;
  clock.set(new Date(invoicingMomentOf(month).getTime() + 5 * 60 * 1000));
  const startsAt = month.cycle().startsAt;
  await ctx.prisma.collectionFloor.create({ data: { id: true, floorAt: startsAt } });
  await ctx.prisma.invoicingFloor.create({ data: { id: true, floorAt: startsAt } });
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

function invoiceMails(): readonly SentMail[] {
  return sentMails.filter((mail) => mail.template === "customer.invoice-issued");
}

/** L'entité, complète, mentions de facture posées. */
async function entity(): Promise<string> {
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
  await staff().put(`${ENTITIES}/${id}/creditor-identifier`).send({ ics: ICS }).expect(204);
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
  return id;
}

/** Un membre de la société, au rôle donné ; son `sub` est son jeton. */
async function member(companyId: string, role: CustomerRole, email: string): Promise<string> {
  seq += 1;
  const sub = `e6-${String(seq)}`;
  const user = await createUser(ctx.prisma, { auth0Sub: sub, email });
  await attachTo(ctx.prisma, user.id, companyId, role);
  return sub;
}

/** Un bon au compte du mois facturé, passé par `companyId`. */
async function orderOf(companyId: string, placedBy: string): Promise<void> {
  seq += 1;
  const user = await ctx.prisma.user.findUniqueOrThrow({ where: { auth0Sub: placedBy } });
  await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-E6-${String(seq)}`,
      companyId,
      placedByUserId: user.id,
      subtotalCents: 10_000,
      totalCents: 10_550,
      vatCents: 550,
      paymentStatus: "not_required",
      createdAt: new Date(closesAt.getTime() - 2 * DAY_MS),
      vatShares: [{ rate: 5.5, amountCents: 550 }],
      lines: {
        create: {
          sku: "PAIN-E6",
          productNameSnapshot: "Pain du mois",
          unitPriceMillicents: 10_000_000,
          vatRate: 5.5,
          quantity: 1,
          lineTotalCents: 10_000,
        },
      },
    },
  });
}

/**
 * Un payeur au compte, mandat actif, TVA posée ; rend la société et le `sub`
 * de qui passe ses bons — son détenteur, ou un commis s'il n'en a pas.
 */
async function payer(entityId: string, ownerEmail: string | null) {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: `Groupe ${String(seq)}` });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { vatNumber: "FR40303265045" },
  });
  await staff().put(`/admin/companies/${company.id}/bank-account`).send(RIB).expect(204);
  await ctx.prisma.paymentMandate.create({
    data: {
      companyId: company.id,
      creditorId: entityId,
      reference: `RUM-E6-${String(seq)}`,
      status: "active",
      acceptedAt: new Date(closesAt.getTime() - 60 * DAY_MS),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
  const owner =
    ownerEmail === null
      ? await member(company.id, CustomerRole.orders, `commis${String(seq)}@groupe.test`)
      : await member(company.id, CustomerRole.owner, ownerEmail);
  return { company, owner };
}

/** Un site qui suit la facturation de son principal depuis avant le mois. */
async function site(principalId: string): Promise<string> {
  seq += 1;
  const created = await createCompany(ctx.prisma, { raisonSociale: `Chalet ${String(seq)}` });
  await ctx.prisma.company.update({
    where: { id: created.id },
    data: { parentCompanyId: principalId },
  });
  await ctx.prisma.companyFollow.create({
    data: {
      companyId: created.id,
      parentId: principalId,
      aspect: "billing",
      validFrom: new Date(closesAt.getTime() - 90 * DAY_MS),
      validTo: null,
    },
  });
  return created.id;
}

async function billingContact(companyId: string, email: string): Promise<void> {
  await ctx.prisma.companyContact.create({
    data: { companyId, prenom: "Claire", nom: "Compta", email, role: "billing" },
  });
}

async function issue(entityId: string): Promise<void> {
  await staff()
    .post(MONTHLY)
    .send({ legalEntityId: entityId, month: month.toString() })
    .expect(200);
  await ctx.drain();
}

describe("« Votre facture » à l'émission (E6, Q3)", () => {
  it("part au payeur et à la facturation du sous-compte, dédoublonnée, au montant de la facture", async () => {
    const id = await entity();
    const { company, owner } = await payer(id, "patron@groupe.test");
    await billingContact(company.id, "compta@groupe.test");
    const chalet = await site(company.id);
    const chaletOrders = await member(chalet, CustomerRole.orders, "commis@chalet.test");
    await member(chalet, CustomerRole.billing, "gerante@chalet.test");
    // La même boîte que le payeur, à la casse près : un seul message.
    await billingContact(chalet, "COMPTA@groupe.test");
    await orderOf(company.id, owner);
    await orderOf(chalet, chaletOrders);

    await issue(id);

    const invoice = await ctx.prisma.invoice.findFirstOrThrow({
      where: { payerCompanyId: company.id },
    });
    const fact = await ctx.prisma.outboxMessage.findUniqueOrThrow({
      where: { key: `invoice.issued:${invoice.id}` },
    });
    expect(fact.type).toBe("invoice.issued");
    expect(invoiceMails().map((mail) => [mail.to, mail.idempotencyKey])).toEqual([
      ["compta@groupe.test", `invoice.notice:${invoice.id}:compta@groupe.test`],
      ["gerante@chalet.test", `invoice.notice:${invoice.id}:gerante@chalet.test`],
    ]);
    expect(invoiceMails()[0]?.data).toMatchObject({
      invoiceNumber: invoice.number,
      total: noticeAmount(invoice.totalTtcCents),
      paymentMeans: "Prélèvement SEPA — mandat RUM-E6-1",
      // E3b : l'envoi attend le rendu, et part avec le PDF/A-3.
      document: { fileName: `${invoice.number}.pdf` },
    });
    const journal = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: invoice.id },
      orderBy: { id: "asc" },
      select: { type: true, payload: true },
    });
    expect(journal.map((event) => event.type)).toEqual([
      "invoice.issued",
      "invoice.document_rendered",
      "invoice.notice_sent",
    ]);
    expect(journal[2]?.payload).toMatchObject({ recipientCount: 2 });
  });

  it("personne à prévenir : rien ne part, et le journal le signale", async () => {
    const id = await entity();
    // Ni contact de facturation, ni détenteur : un commis seul passe les bons.
    const { company, owner } = await payer(id, null);
    await orderOf(company.id, owner);

    await issue(id);

    expect(invoiceMails()).toEqual([]);
    const invoice = await ctx.prisma.invoice.findFirstOrThrow();
    const failed = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { subjectId: invoice.id, type: "invoice.notice_failed" },
    });
    expect(failed.payload).toMatchObject({ recipientCount: 0 });
  });
});

describe("« Mes factures » — le mur client (E6)", () => {
  it("détenteur et facturation : 200 ; autre rôle : 403 ; non-membre : 404 ; pièce d'un autre : 404", async () => {
    const id = await entity();
    const port = await payer(id, "patron@port.test");
    const compta = await member(port.company.id, CustomerRole.billing, "compta@port.test");
    const commis = await member(port.company.id, CustomerRole.orders, "commis@port.test");
    const other = await payer(id, "patron@autre.test");
    await orderOf(port.company.id, port.owner);
    await orderOf(other.company.id, other.owner);
    await issue(id);
    const theirs = await ctx.prisma.invoice.findFirstOrThrow({
      where: { payerCompanyId: other.company.id },
    });
    const base = `/companies/${port.company.id}/invoices`;

    for (const sub of [port.owner, compta]) {
      const list = jsonBody<IssuedInvoicesView>(await ctx.asSub(sub).get(base).expect(200));
      expect(list.invoices).toHaveLength(1);
      expect(list.invoices[0]).toMatchObject({ kind: "invoice", period: month.toString() });
    }
    const [mine] = jsonBody<IssuedInvoicesView>(
      await ctx.asSub(port.owner).get(base).expect(200),
    ).invoices;
    const detail = jsonBody<IssuedInvoiceView>(
      await ctx
        .asSub(compta)
        .get(`${base}/${mine?.invoiceId ?? ""}`)
        .expect(200),
    );
    expect(detail.totalTtcCents).toBe(10_550);
    expect(detail.lines.map((line) => line.sku)).toEqual(["PAIN-E6"]);
    expect(JSON.stringify(detail)).not.toContain("FR1420041010050500013M02606");

    await ctx.asSub(commis).get(base).expect(403);
    await ctx.asSub(other.owner).get(base).expect(404);
    await ctx.asSub(port.owner).get(`${base}/${theirs.id}`).expect(404);

    // Le PDF (E3b) : le même mur.
    const pdf = `${base}/${mine?.invoiceId ?? ""}/pdf`;
    const served = await ctx
      .asSub(compta)
      .get(pdf)
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(served.headers["content-type"]).toBe("application/pdf");
    expect(served.headers["content-disposition"]).toContain(".pdf");
    expect(Buffer.from(jsonBody<Uint8Array>(served)).subarray(0, 5).toString("latin1")).toBe(
      "%PDF-",
    );
    await ctx.asSub(commis).get(pdf).expect(403);
    await ctx.asSub(other.owner).get(pdf).expect(404);
    await ctx.asSub(port.owner).get(`${base}/${theirs.id}/pdf`).expect(404);
  });
});

describe("renvoyer « Votre facture » (E6, suite (b))", () => {
  it("repart aux destinataires d'aujourd'hui sous une clé neuve à chaque renvoi, PDF joint, et le journal le dit", async () => {
    const id = await entity();
    const { company, owner } = await payer(id, "patron@groupe.test");
    await orderOf(company.id, owner);
    await issue(id);
    const invoice = await ctx.prisma.invoice.findFirstOrThrow({
      where: { payerCompanyId: company.id },
    });
    await billingContact(company.id, "compta@groupe.test");
    sentMails.splice(0);
    const route = `/admin/accounting/invoices/${invoice.id}/resend-notice`;

    await staff().post(route).expect(204);
    await staff().post(route).expect(204);

    const keys = invoiceMails().map((mail) => mail.idempotencyKey ?? "");
    expect(invoiceMails().map((mail) => mail.to)).toEqual([
      "compta@groupe.test",
      "compta@groupe.test",
    ]);
    expect(new Set(keys).size).toBe(2);
    for (const key of keys) {
      expect(key).toMatch(/^invoice\.notice-resend:/u);
    }
    expect(invoiceMails()[0]?.data).toMatchObject({
      document: { fileName: `${invoice.number}.pdf` },
    });
    const resent = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: invoice.id, type: "invoice.notice_resent" },
    });
    expect(resent).toHaveLength(2);
    expect(resent[0]?.payload).toMatchObject({ recipientCount: 1, failure: null });
    await staff().post("/admin/accounting/invoices/absente/resend-notice").expect(404);
  });
});

describe("« Mes factures » d'un site (E6, suite (a))", () => {
  it("le site voit la facture de sa maison mère qui couvre son bon, PDF compris ; un site frère sans bon, rien ; le rôle commandes, 403", async () => {
    const id = await entity();
    const { company, owner } = await payer(id, "patron@groupe.test");
    const chalet = await site(company.id);
    const sibling = await site(company.id);
    const chaletOrders = await member(chalet, CustomerRole.orders, "commis@chalet.test");
    const chaletBilling = await member(chalet, CustomerRole.billing, "gerante@chalet.test");
    const chaletOwner = await member(chalet, CustomerRole.owner, "patron@chalet.test");
    const siblingBilling = await member(sibling, CustomerRole.billing, "gerante@frere.test");
    await orderOf(company.id, owner);
    await orderOf(chalet, chaletOrders);
    await issue(id);
    const invoice = await ctx.prisma.invoice.findFirstOrThrow({
      where: { payerCompanyId: company.id },
    });
    const base = `/companies/${chalet}/invoices`;

    for (const sub of [chaletBilling, chaletOwner]) {
      const list = jsonBody<IssuedInvoicesView>(await ctx.asSub(sub).get(base).expect(200));
      expect(list.invoices.map((one) => one.invoiceId)).toEqual([invoice.id]);
    }
    const detail = jsonBody<IssuedInvoiceView>(
      await ctx.asSub(chaletBilling).get(`${base}/${invoice.id}`).expect(200),
    );
    expect(detail.payerCompanyId).toBe(company.id);
    await ctx.asSub(chaletBilling).get(`${base}/${invoice.id}/pdf`).expect(200);
    await ctx.asSub(chaletOrders).get(base).expect(403);

    const siblingBase = `/companies/${sibling}/invoices`;
    const siblingList = jsonBody<IssuedInvoicesView>(
      await ctx.asSub(siblingBilling).get(siblingBase).expect(200),
    );
    expect(siblingList.invoices).toEqual([]);
    await ctx.asSub(siblingBilling).get(`${siblingBase}/${invoice.id}`).expect(404);
    await ctx.asSub(siblingBilling).get(`${siblingBase}/${invoice.id}/pdf`).expect(404);
  });
});

describe("les factures depuis le back-office (E6)", () => {
  it("la fiche liste celles de la société ; la comptabilité ouvre une pièce, 404 sinon", async () => {
    const id = await entity();
    const { company, owner } = await payer(id, "patron@port.test");
    await orderOf(company.id, owner);
    await issue(id);

    const list = jsonBody<IssuedInvoicesView>(
      await staff().get(`/admin/companies/${company.id}/invoices`).expect(200),
    );
    expect(list.invoices).toHaveLength(1);
    const detail = jsonBody<IssuedInvoiceView>(
      await staff()
        .get(`/admin/accounting/invoices/${list.invoices[0]?.invoiceId ?? ""}`)
        .expect(200),
    );
    expect(detail.payerCompanyId).toBe(company.id);
    expect(list.invoices[0]?.documentAvailable).toBe(true);
    await staff().get("/admin/accounting/invoices/absente").expect(404);
  });

  it("le PDF/A-3 rendu après l'émission est rangé, attaché une fois, et servi tel quel (E3b)", async () => {
    const id = await entity();
    const { company, owner } = await payer(id, "patron@port.test");
    await orderOf(company.id, owner);
    await issue(id);
    const invoice = await ctx.prisma.invoice.findFirstOrThrow({
      where: { payerCompanyId: company.id },
    });

    expect(invoice.documentKey).toBe(`invoices/${id}/${invoice.number}.pdf`);
    const served = await staff()
      .get(`/admin/accounting/invoices/${invoice.id}/pdf`)
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const bytes = Buffer.from(jsonBody<Uint8Array>(served));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(invoice.documentSha256);
    expect(bytes.toString("latin1")).toContain("<pdfaid:part>3</pdfaid:part>");
    await staff().get("/admin/accounting/invoices/absente/pdf").expect(404);
  });

  it("un avoir a aussi son PDF, rendu par son propre fait, sans e-mail (E3b)", async () => {
    const id = await entity();
    const { company, owner } = await payer(id, "patron@port.test");
    await orderOf(company.id, owner);
    await issue(id);
    const corrected = await ctx.app
      .get(InvoiceReader)
      .byId(
        (await ctx.prisma.invoice.findFirstOrThrow({ where: { payerCompanyId: company.id } })).id,
      );
    if (corrected === null) {
      throw new Error("facture absente");
    }
    const [first] = corrected.toState().lines;
    const lines = first === undefined ? [] : [{ ...first, amountCents: 100 }];
    sentMails.splice(0);

    const note = await ctx.app.get(InvoiceIssuer).issue({
      legalEntityId: id,
      issuedOn: corrected.toState().issuedOn,
      draft: (number) =>
        Invoice.creditNote({
          id: "cn_e3b",
          number,
          issuedOn: corrected.toState().issuedOn,
          corrected,
          priorCreditNotes: [],
          orders: [],
          lines,
          vat: invoiceVatBreakdown({
            goods: lines.map((line) => ({ htCents: line.amountCents, vatRate: line.vatRate })),
            allowances: [],
            charges: [],
          }),
        }),
    });
    await ctx.drain();

    const stored = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: note.id } });
    expect(stored.documentKey).toBe(`invoices/${id}/${note.number}.pdf`);
    expect(invoiceMails()).toEqual([]);
    await staff().get(`/admin/accounting/invoices/${note.id}/pdf`).expect(200);
  });
});
