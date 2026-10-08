/**
 * E2E de l'**avis de prélèvement** (plan
 * `documentation/facturation/plan-prelevement-automatique.md`, PA2).
 *
 * Ce que seul le vrai SQL prouve : l'avis et son fait de boîte d'envoi sont
 * écrits dans la transaction du lot, avec le montant de l'arrêté, l'échéance
 * du lot et le bon destinataire ; le dépôt est refusé tant qu'un avis n'est
 * pas parti ; une reconstitution envoie un rectificatif.
 *
 * 🔴 Aucun courriel ne part : le mailer est un double qui enregistre.
 *
 * ⚠️ Commandes, mandats et contacts écrits par Prisma : même dette que
 * `collection-batches.e2e-spec.ts`. Aucune date absolue : la clôture est le
 * dernier 1er du mois atteint, calculé par le domaine.
 */
import type { CollectionCycleView, ConstitutedBatchesView } from "@lfd/contracts";
import type { SendMailArgs } from "@lfd/mailer";

import { cycleToConstitute } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import { frozenCollectionDay } from "../src/b2b/accounting/domain/services/collection-calendar.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import type { B2bMails } from "../src/platform/mailer/mail-templates.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ICS = "FR72ZZZ123456";
const DEBTOR_RIB = {
  iban: "FR7630004000031234567890143",
  bic: "BNPAFRPP",
  holder: "Client e2e",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};
const BASE = "/admin/accounting/collection";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

type SentMail = SendMailArgs<B2bMails>;
const sentMails: SentMail[] = [];
let refusal: Error | null = null;
/** Enregistre — ou refuse, quand le test le demande. Rien ne part. */
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    if (refusal !== null) {
      return Promise.reject(refusal);
    }
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

let ctx: E2eContext;
let seq = 0;
let closesAt: Date;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MAILER, value: recordingMailer },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  sentMails.splice(0);
  refusal = null;
  closesAt = cycleToConstitute(new Date(daysAgo(0)), null).closesAt;
  await ctx.prisma.collectionFloor.create({
    data: { id: true, floorAt: new Date(closesAt.getTime() - 30 * DAY_MS) },
  });
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

async function collectingEntity(): Promise<string> {
  const response = await staff()
    .post("/admin/accounting/legal-entities")
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
    .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
    .send({ ics: ICS })
    .expect(204);
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
    .send({ ...DEBTOR_RIB, iban: "FR1420041010050500013M02606", holder: "La Folie Douce" })
    .expect(204);
  return id;
}

/** Une société avec son mandat B2B actif ; ses adresses d'avis sont posées à part. */
async function payer(entityId: string, name: string): Promise<{ id: string; rum: string }> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: name });
  await staff().put(`/admin/companies/${company.id}/bank-account`).send(DEBTOR_RIB).expect(204);
  const rum = `RUM-AVIS-${String(seq)}`;
  await ctx.prisma.paymentMandate.create({
    data: {
      companyId: company.id,
      creditorId: entityId,
      reference: rum,
      status: "active",
      acceptedAt: new Date(closesAt.getTime() - 60 * DAY_MS),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
  return { id: company.id, rum };
}

async function billingContact(companyId: string, email: string): Promise<void> {
  await ctx.prisma.companyContact.create({
    data: { companyId, prenom: "Claire", nom: "Compta", email, role: "billing" },
  });
}

async function owner(companyId: string, email: string): Promise<void> {
  seq += 1;
  const user = await createUser(ctx.prisma, { auth0Sub: `avis-owner-${String(seq)}`, email });
  await attachTo(ctx.prisma, user.id, companyId, CustomerRole.owner);
}

/** Un bon de 100 € HT à 5,5 %, deux jours avant la clôture. */
async function orderOf(companyId: string): Promise<string> {
  seq += 1;
  const user = await createUser(ctx.prisma, { auth0Sub: `avis-${String(seq)}` });
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-AVIS-${String(seq)}`,
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
          sku: "PAIN-AVIS",
          productNameSnapshot: "Pain de l'avis",
          unitPriceMillicents: 10_000_000,
          vatRate: 5.5,
          quantity: 1,
          lineTotalCents: 10_000,
        },
      },
    },
    select: { id: true },
  });
  return order.id;
}

/** Constitue, puis attend que la boîte d'envoi ait livré les avis. */
async function constitute(entityId: string): Promise<string> {
  const response = await staff()
    .post(`${BASE}/batches`)
    .send({ legalEntityId: entityId })
    .expect(201);
  await ctx.drain();
  return jsonBody<ConstitutedBatchesView>(response).batchIds[0] ?? "";
}

async function cycle(entityId: string): Promise<CollectionCycleView> {
  return jsonBody<CollectionCycleView>(
    await staff().get(`${BASE}/cycle?legalEntityId=${entityId}`).expect(200),
  );
}

describe("l'avis de prélèvement, à la constitution (PA2)", () => {
  it("part au contact de facturation, avec le montant de l'arrêté, l'échéance du lot et la RUM", async () => {
    const entity = await collectingEntity();
    const port = await payer(entity, "Boulangerie du Port");
    await billingContact(port.id, "compta@port.test");
    await owner(port.id, "patron@port.test");
    await orderOf(port.id);

    const batchId = await constitute(entity);

    const statement = await ctx.prisma.billingStatement.findFirstOrThrow({ where: { batchId } });
    const notice = await ctx.prisma.collectionNotice.findFirstOrThrow({ where: { batchId } });
    const day = frozenCollectionDay(closesAt, new Date(daysAgo(0)), 14, null).day;
    expect(notice).toMatchObject({
      kind: "notice",
      status: "sent",
      recipientEmail: "compta@port.test",
      recipientSource: "billing_contact",
      amountCents: statement.totalTtcCents,
      mandateReference: port.rum,
      statementId: statement.id,
      creditorIcs: ICS,
    });
    expect(notice.collectionDay.toISOString().slice(0, 10)).toBe(day);
    const outbox = await ctx.prisma.outboxMessage.findUniqueOrThrow({
      where: { key: `collection.notice_to_send:${notice.id}` },
    });
    expect(outbox.type).toBe("collection.notice_to_send");
    expect(sentMails).toHaveLength(1);
    expect(sentMails[0]).toMatchObject({
      to: "compta@port.test",
      template: "customer.collection-notice",
      idempotencyKey: `collection.notice:${notice.id}`,
      data: {
        kind: "notice",
        creditorIdentifier: ICS,
        mandateReference: port.rum,
        statementReference: statement.id,
      },
    });
    const [batch] = (await cycle(entity)).batches;
    expect(batch?.requestedCollectionDay).toBe(day);
    expect(batch?.lines[0]?.notice).toMatchObject({
      kind: "notice",
      status: "sent",
      recipientEmail: "compta@port.test",
    });
  });

  it("sans contact de facturation, au détenteur du compte", async () => {
    const entity = await collectingEntity();
    const port = await payer(entity, "Boulangerie du Port");
    await owner(port.id, "patron@port.test");
    await orderOf(port.id);

    await constitute(entity);

    expect(sentMails.map((mail) => mail.to)).toEqual(["patron@port.test"]);
  });
});

describe("« Marquer déposé » exige les avis envoyés", () => {
  it("ni contact ni détenteur : avis non envoyable, dépôt refusé en nommant le payeur", async () => {
    const entity = await collectingEntity();
    const port = await payer(entity, "Boulangerie du Port");
    await orderOf(port.id);

    const batchId = await constitute(entity);

    expect(sentMails).toHaveLength(0);
    const [batch] = (await cycle(entity)).batches;
    expect(batch?.lines[0]?.notice).toMatchObject({ status: "unsendable", recipientEmail: null });
    const refused = await staff().post(`${BASE}/batches/${batchId}/deposit`).expect(409);
    expect(refused.text).toContain("Boulangerie du Port (aucune adresse");
  });

  it("envoi refusé par le fournisseur : avis en échec, dépôt refusé", async () => {
    const entity = await collectingEntity();
    const port = await payer(entity, "Boulangerie du Port");
    await billingContact(port.id, "compta@port.test");
    await orderOf(port.id);
    refusal = new Error("adresse en liste de suppression");

    const batchId = await constitute(entity);

    const [batch] = (await cycle(entity)).batches;
    expect(batch?.lines[0]?.notice).toMatchObject({
      status: "failed",
      failure: "adresse en liste de suppression",
    });
    const refused = await staff().post(`${BASE}/batches/${batchId}/deposit`).expect(409);
    expect(refused.text).toContain("Boulangerie du Port (envoi de l");
  });

  it("avis envoyé : le dépôt passe", async () => {
    const entity = await collectingEntity();
    const port = await payer(entity, "Boulangerie du Port");
    await billingContact(port.id, "compta@port.test");
    await orderOf(port.id);

    const batchId = await constitute(entity);

    await staff().post(`${BASE}/batches/${batchId}/deposit`).expect(204);
  });
});

describe("annuler puis reconstituer : un avis parti se corrige", () => {
  it("montant changé : un rectificatif part, qui dit l'ancien montant ; le nouveau lot se dépose", async () => {
    const entity = await collectingEntity();
    const port = await payer(entity, "Boulangerie du Port");
    await billingContact(port.id, "compta@port.test");
    await orderOf(port.id);
    const first = await constitute(entity);
    await staff().post(`${BASE}/batches/${first}/cancel`).expect(204);
    await orderOf(port.id);

    const second = await constitute(entity);

    expect(sentMails).toHaveLength(2);
    expect(sentMails[0]).toMatchObject({ data: { kind: "notice", previous: null } });
    expect(sentMails[1]).toMatchObject({ data: { kind: "correction" } });
    expect(sentMails[1]).not.toMatchObject({ data: { previous: null } });
    const correction = await ctx.prisma.collectionNotice.findFirstOrThrow({
      where: { batchId: second },
    });
    expect(correction).toMatchObject({ kind: "correction", status: "sent", amountCents: 21_100 });
    expect(correction.previousAmountCents).toBe(10_550);
    await staff().post(`${BASE}/batches/${second}/deposit`).expect(204);
  });

  it("identique : rien ne repart, et le nouveau lot se dépose", async () => {
    const entity = await collectingEntity();
    const port = await payer(entity, "Boulangerie du Port");
    await billingContact(port.id, "compta@port.test");
    await orderOf(port.id);
    const first = await constitute(entity);
    await staff().post(`${BASE}/batches/${first}/cancel`).expect(204);

    const second = await constitute(entity);

    expect(sentMails).toHaveLength(1);
    const [batch] = (await cycle(entity)).batches;
    expect(batch?.lines[0]?.notice).toMatchObject({ kind: "unchanged", status: "sent" });
    await staff().post(`${BASE}/batches/${second}/deposit`).expect(204);
  });
});
