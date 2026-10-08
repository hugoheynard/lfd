/**
 * E2E de l'**export des mandats pour la banque** (plan
 * `documentation/comptabilite/mandat/plan-export-des-mandats-pour-la-banque.md`, M1).
 *
 * Ce que seul le vrai SQL et le vrai HTTP prouvent : les octets du fichier
 * (CRLF, `;` final, sans en-tête), l'IBAN descellé du vrai `FieldCipher`, la
 * sélection par empreinte relue en base après « Marquer importé », le droit
 * d'écriture sur un `GET`, le mur de l'entité dans la requête, et un journal
 * sans IBAN.
 *
 * ⚠️ Mandats écrits par Prisma : même dette que `collection-batches.e2e-spec.ts`.
 * Aucune date absolue : la signature est relative à maintenant, et la cellule
 * F se calcule par la fonction du domaine sur la MÊME constante.
 */
import type { MandateBankExportCreatedView, MandateBankExportsView } from "@lfd/contracts";

import { signatureDateCell } from "../src/b2b/accounting/domain/services/mandate-bank-export-values.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const ICS = "FR72ZZZ123456";
/** Un ICS ne sert qu'une entité : la seconde a le sien. */
const OTHER_ICS = "FR19ZZZ654321";
const ACCOUNT = {
  iban: "FR1420041010050500013M02606",
  bic: "CEPAFRPP751",
  holder: "Crazeativity",
  line1: "Route de la Balme",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};
const DEBTOR_IBAN = "FR7630004000031234567890143";
const DEBTOR_RIB = {
  iban: DEBTOR_IBAN,
  bic: "BNPAFRPP",
  holder: "Client e2e",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};
/** Signé il y a deux mois — comparé à rien d'autre qu'à sa cellule F. */
const SIGNED_AT = daysAgo(60);

/** Le jeton porteur EST le `sub` : le 403 de la seule lecture se joue en base. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
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
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

function exportsOf(entityId: string): string {
  return `/admin/accounting/legal-entities/${entityId}/mandate-exports`;
}

async function entity(siren: string, ics = ICS): Promise<string> {
  const response = await staff()
    .post("/admin/accounting/legal-entities")
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren,
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
    .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
    .send({ ics })
    .expect(204);
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
    .send(ACCOUNT)
    .expect(204);
  return id;
}

/** Une société avec son RIB, et un mandat actif chez l'entité. */
/**
 * `withoutBic` : un RIB recopié AVANT que le BIC soit exigé — la route le
 * refuse aujourd'hui, la base en garde (`bic = ""`).
 */
async function mandated(entityId: string, name: string, withoutBic = false): Promise<string> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: name });
  await staff().put(`/admin/companies/${company.id}/bank-account`).send(DEBTOR_RIB).expect(204);
  if (withoutBic) {
    await ctx.prisma.companyBankAccount.updateMany({
      where: { companyId: company.id },
      data: { bic: "" },
    });
  }
  const mandate = await ctx.prisma.paymentMandate.create({
    data: {
      companyId: company.id,
      creditorId: entityId,
      reference: `RUM-EXP-${String(seq)}`,
      status: "active",
      acceptedAt: new Date(SIGNED_AT),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
  return mandate.reference;
}

async function prepare(entityId: string, all = false): Promise<string> {
  const response = await staff().post(exportsOf(entityId)).send({ all }).expect(201);
  return jsonBody<MandateBankExportCreatedView>(response).exportId;
}

describe("l'export des mandats pour la banque", () => {
  it("exporte, rend le fichier exact, se marque importé, et n'est plus repris", async () => {
    const entityId = await entity("552100554");
    const rum = await mandated(entityId, "Café de l'Isère");

    const exportId = await prepare(entityId);
    const file = await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);

    expect(file.headers["cache-control"]).toBe("no-store");
    expect(file.headers["content-disposition"]).toMatch(/^attachment;/u);
    expect(file.text).toBe(
      `${rum};${ICS};Cafe de l'Isere;${DEBTOR_IBAN};BNPAFRPPXXX;${signatureDateCell(new Date(SIGNED_AT))};RCUR;B2B;;;;;;;;;;\r\n`,
    );

    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(204);
    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(409);
    await staff().post(exportsOf(entityId)).send({ all: false }).expect(409);

    const card = jsonBody<MandateBankExportsView>(
      await staff().get(exportsOf(entityId)).expect(200),
    );
    expect(card).toMatchObject({ exportableCount: 1, toExportCount: 0, importedCount: 1 });
    expect(card.exports).toHaveLength(1);
    expect(card.exports[0]?.importedAt).not.toBeNull();
  });

  it("nomme un mandat sans BIC et ne l'exporte pas", async () => {
    const entityId = await entity("552100554");
    await mandated(entityId, "Sans Bic", true);
    const kept = await mandated(entityId, "Avec Bic");

    const card = jsonBody<MandateBankExportsView>(
      await staff().get(exportsOf(entityId)).expect(200),
    );
    expect(card.excluded).toEqual([
      expect.objectContaining({ debtorName: "Sans Bic", reason: "no_bic" }),
    ]);
    const exportId = await prepare(entityId);
    const file = await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);
    expect(file.text.split("\r\n")).toHaveLength(2);
    expect(file.text.startsWith(`${kept};`)).toBe(true);
  });

  it("refuse le fichier et l'écriture avec la seule lecture comptable (403)", async () => {
    const entityId = await entity("552100554");
    await mandated(entityId, "Client");
    const exportId = await prepare(entityId);
    const reader = await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "lecture",
        email: "lecture@lfc.test",
        role: "communication",
        status: "active",
        auth0Id: "staff-lecture",
      },
    });
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId: reader.id, resource: "b2b_accounting", action: "read", effect: "allow" },
    });
    const asReader = (): ReturnType<E2eContext["asSub"]> => ctx.asSub("staff-lecture");

    await asReader().get(exportsOf(entityId)).expect(200);
    await asReader()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(403);
    await asReader().post(exportsOf(entityId)).send({ all: true }).expect(403);
    await asReader()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(403);
  });

  it("l'export d'une autre entité n'existe pas sous celle-ci (404)", async () => {
    const owner = await entity("552100554");
    const other = await entity("732829320", OTHER_ICS);
    await mandated(owner, "Client");
    const exportId = await prepare(owner);

    await staff()
      .get(`${exportsOf(other)}/${exportId}/file.csv`)
      .expect(404);
    await staff()
      .post(`${exportsOf(other)}/${exportId}/imported`)
      .expect(404);
  });

  it("refuse (409) le fichier d'un mandat révoqué depuis l'export", async () => {
    const entityId = await entity("552100554");
    const rum = await mandated(entityId, "Client");
    const exportId = await prepare(entityId);
    await ctx.prisma.paymentMandate.updateMany({
      where: { reference: rum },
      data: { status: "revoked", revokedAt: new Date(daysAgo(0)) },
    });

    const refused = await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(409);
    expect(refused.text).toContain(rum);
  });

  it("n'écrit aucun IBAN au journal", async () => {
    const entityId = await entity("552100554");
    await mandated(entityId, "Client");
    const exportId = await prepare(entityId);
    await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);
    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(204);

    const journal = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "mandate_bank_export." } },
      orderBy: { occurredAt: "asc" },
    });
    expect(journal.map((row) => row.type)).toEqual([
      "mandate_bank_export.created",
      "mandate_bank_export.imported",
    ]);
    expect(JSON.stringify(journal)).not.toContain(DEBTOR_IBAN);
    expect(JSON.stringify(journal)).not.toContain(DEBTOR_IBAN.slice(4, 14));
  });
});
