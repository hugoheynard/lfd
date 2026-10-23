/**
 * E2E de l'**export des comptes destinataires pour la banque** (doc
 * `documentation/comptabilite/prelevement/prerequis-export-ribs.md`).
 *
 * Ce que seuls le vrai SQL et le vrai HTTP prouvent : les octets du fichier
 * (16 colonnes, `;` sans terminateur, CRLF, sans en-tête, IBAN découpé),
 * l'IBAN descellé du vrai `FieldCipher`, « nouveaux seulement » relu en base
 * (en vol, importé, déjà connu), le droit d'écriture sur un `GET`, et un
 * journal qui compte chaque téléchargement sans jamais porter d'IBAN.
 *
 * ⚠️ Mandats écrits par Prisma : même dette que `mandate-bank-exports.e2e-spec.ts`.
 * Aucune date comparée à l'horloge.
 */
import type { AccountBankExportCreatedView, AccountBankExportsView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const ICS = "FR72ZZZ123456";
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
const OTHER_IBAN = "DE89370400440532013000";

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
  return `/admin/accounting/legal-entities/${entityId}/account-exports`;
}

async function entity(): Promise<string> {
  const response = await staff()
    .post("/admin/accounting/legal-entities")
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
    .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
    .send({ ics: ICS })
    .expect(204);
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
    .send(ACCOUNT)
    .expect(204);
  return id;
}

/** Un IBAN français VALIDE et distinct par numéro : la clé se calcule (mod 97). */
function frenchIban(n: number): string {
  const bban = `30004000${String(n).padStart(13, "0")}00`;
  const digits = `${bban}152700`; // « FR00 » : F=15, R=27
  let rest = 0;
  for (const digit of digits) {
    rest = (rest * 10 + Number(digit)) % 97;
  }
  return `FR${String(98 - rest).padStart(2, "0")}${bban}`;
}

interface Debtor {
  readonly bankAccountId: string;
}

/** Une société avec son RIB, et un mandat actif chez l'entité. */
async function debtor(
  entityId: string,
  name: string,
  iban = DEBTOR_IBAN,
  withoutBic = false,
): Promise<Debtor> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: name });
  await staff()
    .put(`/admin/companies/${company.id}/bank-account`)
    .send({
      iban,
      bic: "BNPAFRPP",
      holder: `${name} titulaire`,
      line1: "1 rue du Test",
      line2: "",
      postalCode: "73000",
      city: "Chambéry",
      countryCode: "FR",
    })
    .expect(204);
  if (withoutBic) {
    await ctx.prisma.companyBankAccount.updateMany({
      where: { companyId: company.id },
      data: { bic: "" },
    });
  }
  await ctx.prisma.paymentMandate.create({
    data: {
      companyId: company.id,
      creditorId: entityId,
      reference: `RUM-ACC-${String(seq)}`,
      status: "active",
      acceptedAt: new Date(daysAgo(30)),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
  const account = await ctx.prisma.companyBankAccount.findUniqueOrThrow({
    where: { companyId: company.id },
    select: { id: true },
  });
  return { bankAccountId: account.id };
}

async function prepare(entityId: string): Promise<string> {
  const response = await staff().post(exportsOf(entityId)).expect(201);
  return jsonBody<AccountBankExportCreatedView>(response).exportId;
}

async function card(entityId: string): Promise<AccountBankExportsView> {
  return jsonBody<AccountBankExportsView>(await staff().get(exportsOf(entityId)).expect(200));
}

describe("l'export des comptes destinataires pour la banque", () => {
  it("exporte le fichier exact, se marque importé, puis plus rien à exporter", async () => {
    const entityId = await entity();
    await debtor(entityId, "Café de l'Isère");

    const exportId = await prepare(entityId);
    const file = await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);

    expect(file.headers["cache-control"]).toBe("no-store");
    expect(file.headers["content-type"]).toMatch(/^text\/csv; charset=iso-8859-1/u);
    expect(file.headers["content-disposition"]).toMatch(/^attachment;/u);
    // C : le SIREN que la fabrique de société a tiré (9 chiffres).
    expect(file.text).toMatch(
      /^I;Cafe de l'Isere titulaire;\d{9};1 rue du Test;;73000 Chambery;;FR;FR;76;30004000031234567890143;BNPAFRPPXXX;;;;\r\n$/u,
    );

    expect(await card(entityId)).toMatchObject({ toExport: [], inFlightCount: 1 });
    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(204);
    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(409);
    await staff().post(exportsOf(entityId)).expect(409);
    expect(await card(entityId)).toMatchObject({ toExport: [], inFlightCount: 0, knownCount: 1 });
  });

  it("n'exporte que les nouveaux : un second export ne reprend pas les comptes en vol", async () => {
    const entityId = await entity();
    await debtor(entityId, "Premier");
    await prepare(entityId);
    await debtor(entityId, "Second", OTHER_IBAN);

    const second = await prepare(entityId);
    const file = await staff()
      .get(`${exportsOf(entityId)}/${second}/file.csv`)
      .expect(200);
    expect(file.text.split("\r\n")).toEqual([expect.stringContaining("I;Second titulaire;"), ""]);
  });

  it("abandonné, un export rend ses comptes et ne se télécharge plus", async () => {
    const entityId = await entity();
    await debtor(entityId, "Client");
    const exportId = await prepare(entityId);
    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/abandoned`)
      .expect(204);

    await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(409);
    expect((await card(entityId)).toExport).toHaveLength(1);
  });

  it("prend 200 comptes au plus par fichier ; le 201ᵉ attend l'export suivant", async () => {
    const entityId = await entity();
    for (let index = 0; index < 201; index += 1) {
      await debtor(entityId, `Client ${String(index)}`, frenchIban(index));
    }
    expect((await card(entityId)).toExport).toHaveLength(201);

    const first = await prepare(entityId);
    const file = await staff()
      .get(`${exportsOf(entityId)}/${first}/file.csv`)
      .expect(200);
    expect(file.text.split("\r\n")).toHaveLength(201);
    expect(await card(entityId)).toMatchObject({ inFlightCount: 200 });
    expect((await card(entityId)).toExport).toHaveLength(1);
  });

  it("nomme un compte sans BIC et ne l'exporte pas", async () => {
    const entityId = await entity();
    await debtor(entityId, "Sans Bic", OTHER_IBAN, true);
    await debtor(entityId, "Avec Bic");

    const view = await card(entityId);
    expect(view.excluded).toEqual([
      expect.objectContaining({ companyName: "Sans Bic", reason: "no_bic" }),
    ]);
    const exportId = await prepare(entityId);
    const file = await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);
    expect(file.text.split("\r\n")).toHaveLength(2);
    expect(file.text).not.toContain("Sans Bic");
  });

  it("« déjà connu » retire le compte de l'export, une seule fois", async () => {
    const entityId = await entity();
    const { bankAccountId } = await debtor(entityId, "Saisi à la main");

    await staff()
      .post(`${exportsOf(entityId)}/known-accounts`)
      .send({ bankAccountId })
      .expect(204);
    await staff()
      .post(`${exportsOf(entityId)}/known-accounts`)
      .send({ bankAccountId })
      .expect(409);
    await staff().post(exportsOf(entityId)).expect(409);
    expect(await card(entityId)).toMatchObject({ toExport: [], knownCount: 1 });
  });

  it("refuse le fichier et les gestes avec la seule lecture comptable (403)", async () => {
    const entityId = await entity();
    const { bankAccountId } = await debtor(entityId, "Client");
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
    await asReader().post(exportsOf(entityId)).expect(403);
    await asReader()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(403);
    await asReader()
      .post(`${exportsOf(entityId)}/${exportId}/abandoned`)
      .expect(403);
    await asReader()
      .post(`${exportsOf(entityId)}/known-accounts`)
      .send({ bankAccountId })
      .expect(403);
  });

  it("journalise chaque téléchargement, sans jamais un IBAN", async () => {
    const entityId = await entity();
    await debtor(entityId, "Client");
    const exportId = await prepare(entityId);
    for (let round = 0; round < 2; round += 1) {
      await staff()
        .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
        .expect(200);
    }
    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(204);

    const journal = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "account_bank_export." } },
      orderBy: { occurredAt: "asc" },
    });
    expect(journal.map((row) => row.type).sort()).toEqual(
      [
        "account_bank_export.created",
        "account_bank_export.downloaded",
        "account_bank_export.downloaded",
        "account_bank_export.imported",
      ].sort(),
    );
    expect(JSON.stringify(journal)).not.toContain(DEBTOR_IBAN);
    expect(JSON.stringify(journal)).not.toContain(DEBTOR_IBAN.slice(4, 14));
  });
});
