/**
 * E2E des **mentions obligatoires du mandat** — pas de frappe sans elles.
 *
 * Plan : `documentation/b2b/plan-mentions-obligatoires-du-mandat.md` §9.
 *
 * Ce que seul le vrai SQL prouve : le SIREN et la raison sociale lus sont ceux
 * de la **colonne** `companies`, la forme juridique du titulaire celle de
 * `company_bank_accounts`, et la frappe comme les deux lectures jugent sur ces
 * lignes-là — pas sur un doublé qui les mimerait.
 *
 * Frontières doublées : les deux verifiers de jetons (le jeton EST le `sub`).
 */
import type {
  CompanyBankAccountSectionView,
  CustomerMandateOptionsSectionView,
  MandateSectionView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/** Un RIB déposé par un écran qui ne connaît pas encore la forme juridique du titulaire. */
const RIB = {
  iban: "FR1420041010050500013M02606",
  bic: "CEPAFRPP751",
  holder: "Refuge du Col SARL",
  line1: "12 rue des Alpages",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};
/** SIRET à clé de Luhn valide, dont le préfixe est un SIREN valide. */
const SIRET = "73282932000009";
const SIREN = "732829320";
const OWNER = "auth0|owner-mentions";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;
let companyId: string;
let entityId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);
const mandateUrl = (): string => `/admin/companies/${companyId}/mandate`;

/** Une entité émettrice complète — interentreprises, le défaut de la colonne. */
async function declareIssuer(): Promise<string> {
  const response = await staff()
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
  const id = jsonBody<{ id: string }>(response).id;
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
    .send({ ics: "FR00ZZZ900001" })
    .expect(204);
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
    .send({ ...RIB, iban: "FR7630006000011234567890189", holder: "Crazeativity" })
    .expect(204);
  return id;
}

async function section(): Promise<MandateSectionView> {
  return jsonBody<MandateSectionView>(await staff().get(mandateUrl()).expect(200));
}

async function putRib(body: object): Promise<void> {
  await staff().put(`/admin/companies/${companyId}/bank-account`).send(body).expect(204);
}

beforeEach(async () => {
  await ctx.reset();
  // Une société ouverte sans papiers : ni raison sociale, ni SIRET, ni SIREN.
  companyId = (await createCompany(ctx.prisma, { raisonSociale: "", siret: "", siren: "" })).id;
  entityId = await declareIssuer();
  await putRib(RIB);
});

describe("la frappe interentreprises exige ses mentions", () => {
  it("refuse en 409, nomme les mentions, et la section annonce les mêmes codes", async () => {
    const response = await staff().post(mandateUrl()).expect(409);
    const body = jsonBody<{ code: string; message: string }>(response);

    expect(body.code).toBe("payments.mandate.mentions_missing");
    expect(body.message).toContain("SIREN de la société");
    expect(body.message).toContain("forme juridique du titulaire");
    expect((await section()).mintBlockers).toEqual([
      "company_name_missing",
      "siren_missing",
      "holder_legal_form_missing",
    ]);
    expect(await ctx.prisma.paymentMandate.count({ where: { companyId } })).toBe(0);
  });

  it("frappe une fois la raison sociale, le SIREN et la forme juridique posés", async () => {
    await staff()
      .patch(`/admin/companies/${companyId}/identity`)
      .send({ raisonSociale: "Refuge du Col SARL", siret: SIRET, siren: SIREN })
      .expect(204);
    await putRib({ ...RIB, holderLegalForm: "SARL" });

    expect((await section()).mintBlockers).toEqual([]);
    await staff().post(mandateUrl()).expect(201);
    expect((await section()).mandate).toMatchObject({ status: "draft", scheme: "B2B" });
  });

  /** Régression prévenue (plan §8 #7) : un bundle ancien réécrivait le RIB sans le champ. */
  it("un RIB réenregistré sans le champ n'efface pas la forme juridique du titulaire", async () => {
    await putRib({ ...RIB, holderLegalForm: "SARL" });

    await putRib({ ...RIB, holder: "Refuge du Col SAS" });

    const read = await staff().get(`/admin/companies/${companyId}/bank-account`).expect(200);
    expect(jsonBody<CompanyBankAccountSectionView>(read).account).toMatchObject({
      holder: "Refuge du Col SAS",
      holderLegalForm: "SARL",
    });
    const row = await ctx.prisma.companyBankAccount.findUniqueOrThrow({ where: { companyId } });
    expect(row.holderLegalForm).toBe("SARL");
  });
});

describe("la frappe CORE n'exige rien de plus", () => {
  it("frappe sans raison sociale, SIREN ni forme juridique du titulaire", async () => {
    await staff()
      .put(`/admin/accounting/legal-entities/${entityId}/mandate-scheme`)
      .send({ scheme: "CORE" })
      .expect(204);

    expect((await section()).mintBlockers).toEqual([]);
    await staff().post(mandateUrl()).expect(201);
    expect((await section()).mandate).toMatchObject({ status: "draft", scheme: "CORE" });
  });
});

describe("le client lit et subit les mêmes blocages", () => {
  beforeEach(async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: OWNER });
    await attachTo(ctx.prisma, user.id, companyId, CustomerRole.owner);
    await staff().put("/admin/feature-access/customerMandate").send({ value: "open" }).expect(204);
  });

  it("annonce les blocages dans les options, puis la génération les oppose en 409", async () => {
    const options = jsonBody<CustomerMandateOptionsSectionView>(
      await ctx.asSub(OWNER).get(`/companies/${companyId}/mandate-options`).expect(200),
    );
    expect(options.mintBlockers).toEqual([
      "company_name_missing",
      "siren_missing",
      "holder_legal_form_missing",
    ]);

    const refusal = await ctx.asSub(OWNER).post(`/companies/${companyId}/mandate`).expect(409);

    expect(jsonBody<{ code: string }>(refusal).code).toBe("payments.mandate.mentions_missing");
    expect(await ctx.prisma.paymentMandate.count({ where: { companyId } })).toBe(0);
  });
});
