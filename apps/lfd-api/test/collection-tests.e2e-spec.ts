/**
 * E2E du **prélèvement d'essai** et de **nos établissements** (plan
 * `documentation/comptabilite/prelevement/plan-prelevement-d-essai.md`).
 *
 * Ce que seul le vrai SQL et le vrai HTTP prouvent : le droit `collection_test`
 * (403 sans lui), la déclaration relue en base, le refus d'une société non
 * déclarée, le plafond de 1 € et `FNAL` inexprimable à la porte, `OOFF` refusé
 * sur un mandat ponctuel qu'un lot porte, le fichier gardé et VALIDE au XSD
 * officiel, des références `ESS-` de 35 caractères au plus, le retour bancaire
 * `ESS-` rattaché à son essai — et AUCUNE facture, aucun bon, aucun lot, aucun
 * état d'encaissement touché.
 *
 * ⚠️ Mandats et lot écrits par Prisma : même dette que
 * `collection-batches.e2e-spec.ts`. L'horloge est celle du test (`FixedClock`,
 * posée à maintenant) : l'échéance est relue dans la proposition du serveur,
 * jamais écrite en dur.
 */
import type {
  CollectionReturnImportPreviewView,
  CollectionTestCreatedView,
  CollectionTestDebtorsView,
  CollectionTestsView,
  OwnEstablishmentsView,
} from "@lfd/contracts";
import { instantToLocal } from "@lfd/contracts";

import { pain002 } from "../src/b2b/accounting/domain/services/__tests__/bank-return-file-fixtures.js";
import { signatureDateCell } from "../src/b2b/accounting/domain/services/mandate-bank-export-values.js";
import { sha256Of } from "../src/b2b/accounting/domain/services/collection-batch-file.js";
import { TEST_COLLECTION_MIN_BUSINESS_DAYS } from "../src/b2b/accounting/domain/services/collection-test-file.js";
import { businessDaysAfter } from "../src/b2b/accounting/domain/services/target2-calendar.js";
import { pain008XsdErrors } from "../src/b2b/accounting/domain/services/__tests__/pain008-xsd.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { E2E_STAFF_ID, bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ENTITIES = "/admin/accounting/legal-entities";
const ESTABLISHMENTS = "/admin/accounting/own-establishments";
const TESTS = "/admin/accounting/collection-tests";
const RETURNS = "/admin/accounting/collection-returns";
const SEPA_MAX = 35;
const DEBTOR_IBAN = "FR7630004000031234567890143";
const RIB = {
  iban: DEBTOR_IBAN,
  bic: "BNPAFRPP",
  holder: "Folie Douce Val",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};
/** Le comptable de la graine : `b2b_accounting`, mais pas `collection_test`. */
const ACCOUNTANT = { sub: "staff-comptable", id: "fiche-comptable" } as const;

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** Signé il y a deux mois — comparé seulement à sa cellule F. */
const SIGNED_AT = daysAgo(60);
const clock = new FixedClock(new Date());
let ctx: E2eContext;
let seq = 0;

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
  clock.set(new Date());
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

async function entity(): Promise<string> {
  const response = await staff()
    .post(ENTITIES)
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: "552100554",
      rcs: "",
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
  const id = jsonBody<{ id: string }>(response).id;
  await staff()
    .put(`${ENTITIES}/${id}/creditor-identifier`)
    .send({ ics: "FR72ZZZ123456" })
    .expect(204);
  await staff()
    .put(`${ENTITIES}/${id}/creditor-account`)
    .send({ ...RIB, iban: "FR1420041010050500013M02606", bic: "CEPAFRPP751" })
    .expect(204);
  return id;
}

/** Une société active, son RIB, un mandat actif chez l'entité. */
async function ourCompany(
  entityId: string,
  paymentType: "recurrent" | "one_off" = "recurrent",
): Promise<{ companyId: string; mandateId: string }> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: "Folie Douce Val" });
  await staff().put(`/admin/companies/${company.id}/bank-account`).send(RIB).expect(204);
  const mandate = await ctx.prisma.paymentMandate.create({
    data: {
      companyId: company.id,
      creditorId: entityId,
      reference: `RUM-ESS-${String(seq)}`,
      status: "active",
      acceptedAt: new Date(SIGNED_AT),
      scheme: "B2B",
      paymentType,
    },
  });
  return { companyId: company.id, mandateId: mandate.id };
}

async function declare(companyId: string): Promise<void> {
  await staff().post(ESTABLISHMENTS).send({ companyId }).expect(204);
}

async function proposedDay(): Promise<string> {
  const view = jsonBody<CollectionTestDebtorsView>(
    await staff().get(`${TESTS}/debtors`).expect(200),
  );
  const day = view.debtors[0]?.earliestCollectionDay;
  if (day === null || day === undefined) {
    throw new Error(`aucune échéance proposée : ${JSON.stringify(view.debtors)}`);
  }
  return day;
}

function generate(companyId: string, body: Record<string, unknown>) {
  return staff()
    .post(TESTS)
    .send({ companyId, amountCents: 100, sequence: "RCUR", remittance: null, ...body });
}

/** Les tables qu'un essai ne doit JAMAIS toucher. */
async function moneyTables(): Promise<readonly number[]> {
  return Promise.all([
    ctx.prisma.invoice.count(),
    ctx.prisma.order.count(),
    ctx.prisma.collectionBatch.count(),
    ctx.prisma.collectionBatchLine.count(),
    ctx.prisma.orderCollection.count(),
    ctx.prisma.collectionReturn.count(),
    ctx.prisma.collectionNotice.count(),
    ctx.prisma.billingStatement.count(),
  ]);
}

describe("le droit `collection_test`", () => {
  it("refuse (403) la page et l'outil à qui n'a que la comptabilité", async () => {
    await ctx.prisma.staffUser.create({
      data: {
        id: ACCOUNTANT.id,
        firstName: "Fiche",
        lastName: "Comptable",
        email: "comptable@lfc.test",
        role: "comptabilite",
        status: "active",
        auth0Id: ACCOUNTANT.sub,
      },
    });
    const accountant = () => ctx.asSub(ACCOUNTANT.sub);

    await accountant().get(ESTABLISHMENTS).expect(403);
    await accountant().post(ESTABLISHMENTS).send({ companyId: "c" }).expect(403);
    await accountant().get(`${TESTS}/debtors`).expect(403);
    await accountant().post(TESTS).send({}).expect(403);
    await accountant().get(`${TESTS}/debtors/c/mandate.csv`).expect(403);
  });
});

describe("nos établissements", () => {
  it("déclare, relit avec l'auteur, retire — la ligne reste, le journal le dit", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);

    await declare(companyId);
    const view = jsonBody<OwnEstablishmentsView>(await staff().get(ESTABLISHMENTS).expect(200));
    expect(view.establishments).toEqual([
      expect.objectContaining({
        companyId,
        companyName: "Folie Douce Val",
        declaredByName: "Opérateur E2E",
      }),
    ]);
    await staff().post(ESTABLISHMENTS).send({ companyId }).expect(409);

    await staff().post(`${ESTABLISHMENTS}/${companyId}/withdraw`).expect(204);
    expect(
      jsonBody<OwnEstablishmentsView>(await staff().get(ESTABLISHMENTS)).establishments,
    ).toEqual([]);
    expect(
      await ctx.prisma.ownEstablishment.findUniqueOrThrow({ where: { companyId } }),
    ).toMatchObject({
      declaredByStaffId: E2E_STAFF_ID,
      withdrawnByStaffId: E2E_STAFF_ID,
    });
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: companyId, type: { startsWith: "collection." } },
      orderBy: { occurredAt: "asc" },
    });
    expect(facts.map((fact) => fact.type)).toEqual([
      "collection.own_establishment_declared",
      "collection.own_establishment_withdrawn",
    ]);
  });
});

describe("générer un prélèvement d'essai", () => {
  it("refuse une société non déclarée (409), en la nommant", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);

    const response = await generate(companyId, {
      requestedCollectionDay: daysAgo(-30).slice(0, 10),
    }).expect(409);

    expect(JSON.stringify(response.body)).toContain("Folie Douce Val");
    expect(await ctx.prisma.collectionTest.count()).toBe(0);
  });

  it("propose et accepte J + 2 jours ouvrés, refuse J + 1 en nommant la date minimale", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);
    await declare(companyId);
    const today = instantToLocal(clock.now()).day;
    const earliest = businessDaysAfter(today, TEST_COLLECTION_MIN_BUSINESS_DAYS);

    expect(await proposedDay()).toBe(earliest);
    const refused = await generate(companyId, {
      requestedCollectionDay: businessDaysAfter(today, 1),
    }).expect(400);
    expect(JSON.stringify(refused.body)).toContain(earliest);
    await generate(companyId, { requestedCollectionDay: earliest }).expect(201);
  });

  it("refuse 1,01 € (400), et FNAL à la porte (400)", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);
    await declare(companyId);
    const day = await proposedDay();

    await generate(companyId, { requestedCollectionDay: day, amountCents: 101 }).expect(400);
    await generate(companyId, { requestedCollectionDay: day, sequence: "FNAL" }).expect(400);
    expect(await ctx.prisma.collectionTest.count()).toBe(0);
  });

  it("refuse OOFF sur un mandat ponctuel qu'un lot réel porte (409)", async () => {
    const entityId = await entity();
    const { companyId, mandateId } = await ourCompany(entityId, "one_off");
    await declare(companyId);
    await batchCarrying(entityId, companyId, mandateId);

    const view = jsonBody<CollectionTestDebtorsView>(
      await staff().get(`${TESTS}/debtors`).expect(200),
    );
    expect(view.debtors[0]?.refusal).toContain("lot de prélèvement réel");
    await generate(companyId, {
      requestedCollectionDay: daysAgo(-30).slice(0, 10),
      sequence: "OOFF",
    }).expect(409);
  });

  it("garde un fichier valide au XSD, aux références ESS- ≤ 35, sans toucher l'argent réel", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);
    await declare(companyId);
    const day = await proposedDay();
    const before = await moneyTables();

    const created = jsonBody<CollectionTestCreatedView>(
      await generate(companyId, {
        requestedCollectionDay: day,
        sequence: "FRST",
        amountCents: 42,
      }).expect(201),
    );
    const file = await staff().get(`${TESTS}/${created.testId}/file.xml`).expect(200);
    const xml = file.text;

    expect(file.headers["content-disposition"]).toContain(
      `ESSAI-prelevement-ESS-${created.testId}.xml`,
    );
    expect(await pain008XsdErrors(xml)).toEqual([]);
    expect(xml).toContain("<SeqTp>FRST</SeqTp>");
    expect(xml).toContain(`<ReqdColltnDt>${day}</ReqdColltnDt>`);
    expect(xml).toContain(DEBTOR_IBAN);
    const ids = [...xml.matchAll(/<(MsgId|PmtInfId|EndToEndId)>([^<]*)</gu)].map(
      (match) => match[2] ?? "",
    );
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      expect(id.startsWith("ESS-")).toBe(true);
      expect(id.length).toBeLessThanOrEqual(SEPA_MAX);
    }
    const list = jsonBody<CollectionTestsView>(await staff().get(TESTS).expect(200));
    expect(list.tests).toEqual([
      expect.objectContaining({ id: created.testId, status: "awaiting_due_date", amountCents: 42 }),
    ]);
    expect(JSON.stringify(list)).not.toContain(DEBTOR_IBAN);
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "collection.test_generated" },
    });
    expect(JSON.stringify(fact.payload)).not.toContain(DEBTOR_IBAN);
    expect(await moneyTables()).toEqual(before);
  });

  it("« à rembourser » après l'échéance, puis « Marqué remboursé »", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);
    await declare(companyId);
    const day = await proposedDay();
    const { testId } = jsonBody<CollectionTestCreatedView>(
      await generate(companyId, { requestedCollectionDay: day }).expect(201),
    );
    await staff().post(`${TESTS}/${testId}/refunded`).send({ refundedOn: day }).expect(409);

    clock.set(new Date(new Date(`${day}T12:00:00.000Z`).getTime() + DAY_MS));
    expect(jsonBody<CollectionTestsView>(await staff().get(TESTS)).tests[0]?.status).toBe(
      "to_refund",
    );
    await staff().post(`${TESTS}/${testId}/refunded`).send({ refundedOn: day }).expect(204);

    expect(jsonBody<CollectionTestsView>(await staff().get(TESTS)).tests[0]).toMatchObject({
      status: "refunded",
      refundedOn: day,
      refundedByName: "Opérateur E2E",
    });
  });
});

describe("le mandat de l'établissement pour la banque", () => {
  it("rend la seule ligne du mandat choisi, au format d'import, sans figer d'export", async () => {
    const entityId = await entity();
    const { companyId, mandateId } = await ourCompany(entityId);
    const other = await ourCompany(entityId);
    await declare(companyId);
    await declare(other.companyId);
    const { reference } = await ctx.prisma.paymentMandate.findUniqueOrThrow({
      where: { id: mandateId },
    });

    const file = await staff().get(`${TESTS}/debtors/${companyId}/mandate.csv`).expect(200);

    expect(file.headers["cache-control"]).toBe("no-store");
    expect(file.headers["content-type"]).toContain("text/csv");
    expect(file.headers["content-disposition"]).toContain(
      `ESSAI-mandat-banque-552100554-${reference}.csv`,
    );
    const cells = file.text.split(";");
    expect(file.text.split("\r\n")).toEqual([expect.any(String), ""]);
    expect(cells.slice(0, 8)).toEqual([
      reference,
      "FR72ZZZ123456",
      "Folie Douce Val",
      DEBTOR_IBAN,
      expect.stringMatching(/^BNPAFRPP/u),
      signatureDateCell(new Date(SIGNED_AT)),
      "RECURRENT",
      "B2B",
    ]);
    // I et J vides, K « O », L « N », M à R vides (modèle CENET, 18 colonnes).
    expect(file.text.endsWith("B2B;;;O;N;;;;;;;\r\n")).toBe(true);
    expect(await ctx.prisma.mandateBankExport.count()).toBe(0);
  });

  it("refuse une société non déclarée (409)", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);
    await staff().get(`${TESTS}/debtors/${companyId}/mandate.csv`).expect(409);
  });
});

describe("le retour bancaire d'un essai", () => {
  it("une référence ESS- se rattache à son essai, jamais à un lot", async () => {
    const entityId = await entity();
    const { companyId } = await ourCompany(entityId);
    await declare(companyId);
    const day = await proposedDay();
    const { testId } = jsonBody<CollectionTestCreatedView>(
      await generate(companyId, { requestedCollectionDay: day }).expect(201),
    );
    const reference = `ESS-${testId}`;
    const xml = pain002(day, [{ endToEndId: reference, amount: "1.00", code: "AM04" }]);
    const before = await moneyTables();

    const preview = jsonBody<CollectionReturnImportPreviewView>(
      await staff()
        .post(`${RETURNS}/import/preview`)
        .attach("file", Buffer.from(xml), "retours.xml")
        .expect(200),
    );
    expect(preview.entries).toEqual([
      expect.objectContaining({
        endToEndId: reference,
        status: "collection_test",
        debtorName: "Folie Douce Val",
      }),
    ]);
    await staff()
      .post(`${RETURNS}/import/confirm`)
      .attach("file", Buffer.from(xml), "retours.xml")
      .field("endToEndIds", JSON.stringify([reference]))
      .expect(201);

    const list = jsonBody<CollectionTestsView>(await staff().get(TESTS).expect(200));
    expect(list.tests[0]).toMatchObject({
      status: "returned",
      bankReturn: { kind: "reject", reasonCode: "AM04", amountCents: 100 },
    });
    expect(await moneyTables()).toEqual(before);
  });
});

/**
 * Un lot CONSTITUÉ dont la ligne porte ce mandat. Écrit par Prisma (même dette
 * que `collection-batches.e2e-spec.ts`) : la constitution réelle demande un
 * cycle de commandes entier, et seule la présence de la ligne compte ici.
 */
async function batchCarrying(
  entityId: string,
  companyId: string,
  mandateId: string,
): Promise<void> {
  const now = new Date();
  await ctx.prisma.collectionBatch.create({
    data: {
      id: "01JBQ7Z5K8M3QT9P2X4BLOT000",
      legalEntityId: entityId,
      scheme: "B2B",
      cycleStartsAt: new Date(now.getTime() - 30 * DAY_MS),
      cycleClosesAt: now,
      status: "constituted",
      constitutedAt: now,
      constitutedByStaffId: E2E_STAFF_ID,
      xml: "<Document/>",
      fileSha256: sha256Of("<Document/>"),
      lines: {
        create: {
          rank: 1,
          endToEndId: "01JBQ7Z5K8M3QT9P2X4BLOT000-0001",
          mandateId,
          mandateReference: "RUM-LOT",
          mandateSignedAt: now,
          debtorCompanyId: companyId,
          debtorName: "Folie Douce Val",
          debtorIbanSealed: "scelle",
          debtorIbanLast4: "0143",
          sequence: "OOFF",
          amountCents: 1_000,
          orderCount: 1,
          priorOrderCount: 0,
        },
      },
    },
  });
}
