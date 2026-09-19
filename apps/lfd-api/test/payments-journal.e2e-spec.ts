/**
 * E2E : **le RIB et la révocation du mandat entrent au journal**, dans la
 * transaction du geste — staff ET client (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, tranche
 * (a), et §3 décision 1, 2026-09-19).
 *
 * Ce que seule cette suite prouve :
 *
 * - le fait `company.bank_account_changed` est écrit sous le VRAI auteur — la
 *   fiche staff, ou l'id `users` du client, jamais le `sub` ;
 * - 🔴 sa charge ne porte **jamais l'IBAN** : l'assertion le cherche dans la
 *   ligne SQL elle-même, pas dans un double ;
 * - un seul fait par changement de RIB, brouillon de mandat ou non — le
 *   brouillon révoqué garde son propre fait, sur le mandat ;
 * - un journal qui refuse d'écrire annule le geste (panne posée en SQL, comme
 *   dans `pim-journal-atomicity`) ;
 * - l'envoi du mandat au client laisse `payment_mandate.sent`, sous la fiche
 *   staff, avec le reçu du fournisseur et **sans l'adresse** — cherchée, elle
 *   aussi, dans la ligne SQL (décision de Hugo, 2026-09-19).
 */
import type { MailReceipt } from "@lfd/mailer";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/** IBAN d'exemple de la documentation bancaire française — clé mod-97 correcte. */
const IBAN = "FR1420041010050500013M02606";
const OTHER_IBAN = "DE89370400440532013000";
const RIB = {
  iban: IBAN,
  bic: "CEPAFRPP751",
  holder: "Refuge du Col SARL",
  line1: "12 rue des Alpages",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};
const OWNER = "auth0|owner";
const CHANGED = "company.bank_account_changed";
const REFUSAL = "e2e_journal_rib_en_panne";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

/** Le reçu que le fournisseur rend : c'est lui, et non l'adresse, que le fait retient. */
const PROVIDER_ID = "re_e2e_mandat";
const acceptingMailer = {
  enabled: true,
  send: (): Promise<MailReceipt> => Promise.resolve({ providerId: PROVIDER_ID }),
};

let ctx: E2eContext;
let companyId: string;
/** La société semée, nommée par sa raison sociale faute d'enseigne (lot B du plan des phrases). */
const COMPANY_NAME = "Café de Test SAS";
let ownerId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MAILER, value: acceptingMailer },
    ],
  });
});

afterAll(async () => {
  await repairJournal();
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await repairJournal();
  companyId = (await createCompany(ctx.prisma)).id;
  const owner = await createUser(ctx.prisma, { auth0Sub: OWNER });
  await attachTo(ctx.prisma, owner.id, companyId, CustomerRole.owner);
  ownerId = owner.id;
});

const staffPut = (body: object) =>
  ctx.asSub(E2E_STAFF_SUB).put(`/admin/companies/${companyId}/bank-account`).send(body);
const customerPut = (body: object) =>
  ctx.asSub(OWNER).put(`/companies/${companyId}/bank-account`).send(body);

async function breakJournal(type: string): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `ALTER TABLE growth.activity_events
       ADD CONSTRAINT ${REFUSAL} CHECK (type <> '${type}') NOT VALID`,
  );
}

async function repairJournal(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `ALTER TABLE growth.activity_events DROP CONSTRAINT IF EXISTS ${REFUSAL}`,
  );
}

async function facts(type: string) {
  return ctx.prisma.activityEvent.findMany({
    where: { type },
    orderBy: { id: "asc" },
    select: { subjectType: true, subjectId: true, actorType: true, actorId: true, payload: true },
  });
}

/** Un mandat posé en base — même dette que `mandate.e2e-spec.ts`, écrite là-bas. */
async function seedMandate(status: "active" | "draft"): Promise<string> {
  const row = await ctx.prisma.paymentMandate.create({
    data: {
      scheme: "B2B",
      paymentType: "recurrent",
      companyId,
      reference: "RUM-E2E",
      last4: "3000",
      bankCode: "BNPA",
      country: "FR",
      status,
      acceptedAt: status === "draft" ? null : new Date(daysAgo(30)),
    },
    select: { id: true },
  });
  return row.id;
}

describe("le RIB changé par le STAFF", () => {
  it("écrit un fait sur la société : avant, après, sous la fiche staff", async () => {
    await staffPut(RIB).expect(204);
    await staffPut({ ...RIB, iban: OTHER_IBAN, holder: "Refuge du Col SAS" }).expect(204);

    const written = await facts(CHANGED);
    expect(written).toHaveLength(2);
    expect(written[1]).toMatchObject({
      subjectType: "company",
      subjectId: companyId,
      actorType: "staff",
      actorId: E2E_STAFF_ID,
      payload: {
        before: { last4: "2606", holder: "Refuge du Col SARL" },
        after: { last4: "3000", holder: "Refuge du Col SAS" },
        via: "staff",
      },
    });
  });

  /** 🔴 La ligne SQL elle-même : un IBAN au journal se relirait des années après. */
  it("ne laisse JAMAIS l'IBAN entrer dans la charge", async () => {
    await staffPut(RIB).expect(204);
    await staffPut({ ...RIB, iban: OTHER_IBAN }).expect(204);

    const rows = await ctx.prisma.activityEvent.findMany({ select: { payload: true } });
    const journal = JSON.stringify(rows);
    expect(journal).toContain("2606");
    expect(journal).not.toContain(IBAN);
    expect(journal).not.toContain(OTHER_IBAN);
    expect(journal).not.toContain("20041010050500013M0");
    expect(journal).not.toContain(RIB.bic);
  });

  it("un seul fait de RIB quand un brouillon existe — le brouillon garde le sien", async () => {
    await seedMandate("draft");

    await staffPut(RIB).expect(204);

    expect(await facts(CHANGED)).toHaveLength(1);
    expect(await facts("payment_mandate.draft_voided")).toHaveLength(1);
  });

  it("ANNULE le RIB quand le journal refuse d'écrire", async () => {
    await breakJournal(CHANGED);

    const response = await staffPut(RIB);

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await ctx.prisma.companyBankAccount.count({ where: { companyId } })).toBe(0);
  });

  it("ANNULE aussi la révocation du brouillon quand le journal refuse d'écrire", async () => {
    const draftId = await seedMandate("draft");
    await breakJournal(CHANGED);

    const response = await staffPut(RIB);

    expect(response.status).toBeGreaterThanOrEqual(500);
    const draft = await ctx.prisma.paymentMandate.findUniqueOrThrow({ where: { id: draftId } });
    expect(draft.status).toBe("draft");
    expect(await facts("payment_mandate.draft_voided")).toHaveLength(0);
  });
});

describe("le RIB changé par le CLIENT (décision du 2026-09-19)", () => {
  it("écrit le même fait, sous l'id du client — jamais son `sub`", async () => {
    await customerPut(RIB).expect(204);

    expect(await facts(CHANGED)).toEqual([
      {
        subjectType: "company",
        subjectId: companyId,
        actorType: "customer",
        actorId: ownerId,
        payload: {
          subjectLabel: COMPANY_NAME,
          bankAccountId: expect.any(String) as string,
          before: null,
          after: { last4: "2606", holder: "Refuge du Col SARL" },
          via: "customer",
        },
      },
    ]);
  });

  it("ne laisse JAMAIS l'IBAN entrer dans la charge", async () => {
    await customerPut(RIB).expect(204);

    const journal = JSON.stringify(await facts(CHANGED));
    expect(journal).not.toContain(IBAN);
    expect(journal).not.toContain(OWNER);
  });

  it("ANNULE le RIB quand le journal refuse d'écrire", async () => {
    await breakJournal(CHANGED);

    const response = await customerPut(RIB);

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await ctx.prisma.companyBankAccount.count({ where: { companyId } })).toBe(0);
  });
});

describe("la révocation du mandat par le staff", () => {
  it("écrit un fait sur le mandat, avec sa RUM et son état d'avant", async () => {
    const mandateId = await seedMandate("active");

    await ctx.asSub(E2E_STAFF_SUB).delete(`/admin/companies/${companyId}/mandate`).expect(204);

    expect(await facts("payment_mandate.revoked")).toEqual([
      {
        subjectType: "payment_mandate",
        subjectId: mandateId,
        actorType: "staff",
        actorId: E2E_STAFF_ID,
        payload: {
          subjectLabel: "RUM-E2E",
          company: { id: companyId, name: COMPANY_NAME },
          reference: "RUM-E2E",
          previousStatus: "active",
          via: "staff",
        },
      },
    ]);
  });

  it("ANNULE la révocation locale quand le journal refuse d'écrire", async () => {
    const mandateId = await seedMandate("active");
    await breakJournal("payment_mandate.revoked");

    const response = await ctx.asSub(E2E_STAFF_SUB).delete(`/admin/companies/${companyId}/mandate`);

    expect(response.status).toBeGreaterThanOrEqual(500);
    const row = await ctx.prisma.paymentMandate.findUniqueOrThrow({ where: { id: mandateId } });
    expect(row.status).toBe("active");
  });
});

/** Un émetteur complet — identité, ICS, compte créancier : la frappe l'exige. */
async function declareIssuer(): Promise<void> {
  const staff = ctx.asSub(E2E_STAFF_SUB);
  const created = await staff
    .post("/admin/accounting/legal-entities")
    .send({
      name: "Crazeativity",
      legalForm: "SAS",
      siren: "900000001",
      rcs: "Chambéry",
      shareCapitalCents: 1_000_000,
      vatNumber: "",
      address: {
        line1: "Route de la Balme",
        line2: "",
        postalCode: "73150",
        city: "Val d'Isère",
        countryCode: "FR",
      },
    })
    .expect(201);
  const id = jsonBody<{ id: string }>(created).id;
  const entity = `/admin/accounting/legal-entities/${id}`;
  await staff.put(`${entity}/creditor-identifier`).send({ ics: "FR00ZZZ900001" }).expect(204);
  await staff
    .put(`${entity}/creditor-account`)
    .send({ ...RIB, iban: "FR7630006000011234567890189", holder: "Crazeativity" })
    .expect(204);
}

describe("l'envoi du mandat au client par le staff", () => {
  it("écrit un fait sur le mandat, sous la fiche staff, avec le reçu et sans l'adresse", async () => {
    await declareIssuer();
    await staffPut({ ...RIB, holderLegalForm: "SARL" }).expect(204);
    const minted = await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/companies/${companyId}/mandate`)
      .expect(201);
    const mandateId = jsonBody<{ id: string }>(minted).id;

    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/companies/${companyId}/mandate/${mandateId}/send`)
      .expect(204);

    const { reference } = await ctx.prisma.paymentMandate.findUniqueOrThrow({
      where: { id: mandateId },
    });
    expect(await facts("payment_mandate.sent")).toEqual([
      {
        subjectType: "payment_mandate",
        subjectId: mandateId,
        actorType: "staff",
        actorId: E2E_STAFF_ID,
        payload: {
          subjectLabel: reference,
          company: { id: companyId, name: COMPANY_NAME },
          reference,
          providerId: PROVIDER_ID,
        },
      },
    ]);
    const { contactEmail } = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
    });
    const rows = await ctx.prisma.activityEvent.findMany({
      where: { type: "payment_mandate.sent" },
    });
    expect(JSON.stringify(rows)).not.toContain(contactEmail);
  });
});
