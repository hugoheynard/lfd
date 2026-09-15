/**
 * E2E du **schéma de mandat de l'entité émettrice** — CORE ou interentreprises.
 *
 * Plan : `documentation/comptabilite/plan-mandat-deux-schemas.md` §10.4.
 *
 * Ce que seul le vrai SQL prouve : la colonne de l'entité bascule, le fait entre
 * au journal avec son acteur, les brouillons de TOUTES les sociétés émis par
 * l'entité passent réellement `revoked` dans la même transaction, et un actif
 * ne bouge pas — son schéma est figé sur sa ligne.
 */
import { Buffer } from "node:buffer";

import type {
  MandateSchemeUsageView,
  MandateSectionView,
  PaymentMandateView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import { storageKeys } from "./storage.js";

const RIB = {
  iban: "FR1420041010050500013M02606",
  bic: "CEPAFRPP751",
  holder: "Refuge du Col SARL",
  // Exigée par le mandat interentreprises (plan mentions obligatoires §9).
  holderLegalForm: "SARL",
  line1: "12 rue des Alpages",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};
const PDF = Buffer.from("%PDF-1.4\nmandat signé", "latin1");
/** La date du papier — relative : l'agrégat refuse une date à venir. */
const ON_PAPER = daysAgo(2).slice(0, 10);
/** Un jeton valide, mais un `sub` que l'annuaire staff ne connaît pas. */
const STRANGER = "auth0|inconnu-du-staff";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;
let entityId: string;
let companyId: string;
let neighbourId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);
const schemeUrl = (id = entityId): string =>
  `/admin/accounting/legal-entities/${id}/mandate-scheme`;
const defaultsUrl = (): string => `/admin/accounting/legal-entities/${entityId}/mandate-defaults`;

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

async function mint(company: string): Promise<string> {
  const response = await staff().post(`/admin/companies/${company}/mandate`).expect(201);
  return jsonBody<{ id: string }>(response).id;
}

async function activate(company: string): Promise<string> {
  const id = await mint(company);
  await staff()
    .put(`/admin/companies/${company}/mandate/proof`)
    .attach("file", PDF, "scan.pdf")
    .expect(204);
  const proofRevision = (await mandateOf(company))?.proofRevision;
  await staff()
    .put(`/admin/companies/${company}/mandate/${id}/signature`)
    .send({ signedAt: ON_PAPER, proofRevision })
    .expect(204);
  return id;
}

async function mandateOf(company: string): Promise<PaymentMandateView | null> {
  const response = await staff().get(`/admin/companies/${company}/mandate`).expect(200);
  return jsonBody<MandateSectionView>(response).mandate;
}

async function usage(): Promise<MandateSchemeUsageView> {
  return jsonBody<MandateSchemeUsageView>(await staff().get(schemeUrl()).expect(200));
}

async function voidedCauses(): Promise<readonly unknown[]> {
  const rows = await ctx.prisma.activityEvent.findMany({
    where: { type: "payment_mandate.draft_voided" },
  });
  return rows.map((row) => row.payload);
}

beforeEach(async () => {
  await ctx.reset();
  entityId = await declareIssuer();
  companyId = (await createCompany(ctx.prisma)).id;
  neighbourId = (await createCompany(ctx.prisma)).id;
  for (const id of [companyId, neighbourId]) {
    await staff().put(`/admin/companies/${id}/bank-account`).send(RIB).expect(204);
  }
});

describe("le mur — même surface que les réglages de mandat", () => {
  it("refuse sans jeton en 401, GET comme PUT", async () => {
    await ctx.http().get(schemeUrl()).expect(401);
    await ctx.http().put(schemeUrl()).send({ scheme: "CORE" }).expect(401);
  });

  it("refuse en 403 un porteur que l'annuaire staff ne connaît pas", async () => {
    await ctx.asSub(STRANGER).get(schemeUrl()).expect(403);
    await ctx.asSub(STRANGER).put(schemeUrl()).send({ scheme: "CORE" }).expect(403);
  });

  it("refuse un schéma inconnu en 400, et une entité inconnue en 404", async () => {
    await staff().put(schemeUrl()).send({ scheme: "SEPA" }).expect(400);
    await staff().put(schemeUrl()).send({}).expect(400);
    await staff().get(schemeUrl("inconnue")).expect(404);
    await staff().put(schemeUrl("inconnue")).send({ scheme: "CORE" }).expect(404);
  });
});

describe("GET mandate-scheme — ce qu'une bascule laisserait derrière elle", () => {
  it("compte les actifs par schéma et les brouillons émis par l'entité", async () => {
    await activate(neighbourId);
    await mint(companyId);

    expect(await usage()).toEqual({
      scheme: "B2B",
      activeByScheme: { CORE: 0, B2B: 1 },
      drafts: 1,
    });
  });
});

describe("PUT mandate-scheme — la bascule", () => {
  it("ne fait RIEN sur le schéma déjà en place : ni fait, ni brouillon révoqué", async () => {
    const draftId = await mint(companyId);

    await staff().put(schemeUrl()).send({ scheme: "B2B" }).expect(204);

    expect(await mandateOf(companyId)).toMatchObject({ id: draftId, status: "draft" });
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "legal_entity.mandate_scheme_changed" },
      }),
    ).toBe(0);
    expect(await voidedCauses()).toEqual([]);
  });

  it("journalise avant → après avec l'acteur, rend les brouillons caducs, garde les actifs", async () => {
    const activeId = await activate(neighbourId);
    const draftId = await mint(companyId);

    await staff().put(schemeUrl()).send({ scheme: "CORE" }).expect(204);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "legal_entity.mandate_scheme_changed" },
    });
    expect(facts).toEqual([
      expect.objectContaining({
        subjectId: entityId,
        payload: { from: "B2B", to: "CORE" },
        actorType: "staff",
      }),
    ]);
    expect(await mandateOf(companyId)).toMatchObject({ id: draftId, status: "revoked" });
    expect(await voidedCauses()).toEqual([
      expect.objectContaining({ cause: "mandate_scheme_changed", via: "staff" }),
    ]);
    expect(
      await ctx.prisma.staffNotification.count({ where: { kind: "payment_mandate.draft_voided" } }),
    ).toBe(1);
    // L'actif a figé son schéma : il reste actif, et interentreprises.
    expect(await mandateOf(neighbourId)).toMatchObject({
      id: activeId,
      status: "active",
      scheme: "B2B",
    });
    expect(await usage()).toEqual({
      scheme: "CORE",
      activeByScheme: { CORE: 0, B2B: 1 },
      drafts: 0,
    });
    // Le mandat suivant se frappe sous le nouveau schéma.
    await mint(companyId);
    expect(await mandateOf(companyId)).toMatchObject({ status: "draft", scheme: "CORE" });
  });

  /**
   * Plan `documentation/comptabilite/plan-restes-du-mandat.md` §4 et §7 #10 : la
   * pièce d'un brouillon rendu caduc par l'émetteur est purgée APRÈS la
   * transaction du réglage ; celle d'un mandat signé reste.
   */
  it("purge le scan du brouillon rendu caduc, garde celui du mandat signé", async () => {
    await activate(neighbourId);
    await mint(companyId);
    await staff()
      .put(`/admin/companies/${companyId}/mandate/proof`)
      .attach("file", PDF, "scan.pdf")
      .expect(204);

    await staff().put(schemeUrl()).send({ scheme: "CORE" }).expect(204);

    expect(await mandateOf(companyId)).toMatchObject({ status: "revoked" });
    const keys = await storageKeys();
    expect(keys.filter((key) => key.startsWith(`companies/${companyId}/`))).toEqual([]);
    expect(keys.filter((key) => key.startsWith(`companies/${neighbourId}/`))).toHaveLength(1);
    expect(
      await ctx.prisma.activityEvent.count({ where: { type: "payment_mandate.proof_purged" } }),
    ).toBe(1);
  });
});

describe("PUT mandate-defaults — les brouillons dont le papier change", () => {
  it("rend le brouillon caduc quand le type de paiement change", async () => {
    const draftId = await mint(companyId);

    await staff()
      .put(defaultsUrl())
      .send({ contractDescription: "", paymentType: "one_off" })
      .expect(204);

    expect(await mandateOf(companyId)).toMatchObject({ id: draftId, status: "revoked" });
    expect(await voidedCauses()).toEqual([
      expect.objectContaining({ cause: "mandate_defaults_changed", via: "staff" }),
    ]);
  });

  it("garde le brouillon interentreprises quand seule la description change", async () => {
    const draftId = await mint(companyId);

    await staff()
      .put(defaultsUrl())
      .send({ contractDescription: "Fourniture de viennoiseries", paymentType: "recurrent" })
      .expect(204);

    expect(await mandateOf(companyId)).toMatchObject({ id: draftId, status: "draft" });
    expect(await voidedCauses()).toEqual([]);
  });

  it("rend le brouillon CORE caduc quand la description change — seul le CORE l'imprime", async () => {
    await staff().put(schemeUrl()).send({ scheme: "CORE" }).expect(204);
    const draftId = await mint(companyId);

    await staff()
      .put(defaultsUrl())
      .send({ contractDescription: "Fourniture de viennoiseries", paymentType: "recurrent" })
      .expect(204);

    expect(await mandateOf(companyId)).toMatchObject({ id: draftId, status: "revoked" });
  });
});
