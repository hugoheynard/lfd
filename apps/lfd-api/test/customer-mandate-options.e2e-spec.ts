/**
 * E2E des **zones 14 et 19 réglées par le client** — `/mon-compte`.
 *
 * Plan : `documentation/comptabilite/plan-mandat-client.md` §10 (décidé le 2026-09-14).
 *
 * Voisin de `customer-mandate.e2e-spec.ts`, et pas une section de plus : ce
 * fichier-là dépasse déjà la taille d'un fichier. Même mécanique de semis.
 *
 * Ce que seul le vrai SQL prouve : le mur lit le vrai rattachement, le drapeau
 * la vraie table, la relecture passe par la vraie colonne, et un brouillon
 * existant devient réellement `revoked`.
 */
import { Buffer } from "node:buffer";

import type {
  CustomerMandateOptionsSectionView,
  CustomerMandateView,
  MandateSectionView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

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
const OPTIONS = { debtorReference: "C-9P2X4B", contractNumber: "CT-42" };
const PDF = Buffer.from("%PDF-1.4\nmandat signé", "latin1");
/** La date du papier — relative : l'agrégat refuse une date à venir. */
const ON_PAPER = daysAgo(2).slice(0, 10);

const OWNER = "auth0|owner";
const BILLING = "auth0|billing";
const ADMIN = "auth0|admin";
const ORDERS = "auth0|orders";
const OUTSIDER = "auth0|outsider";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;
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

async function member(sub: string, target: string, role: CustomerRole): Promise<void> {
  const user = await createUser(ctx.prisma, { auth0Sub: sub });
  await attachTo(ctx.prisma, user.id, target, role);
}

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Une entité émettrice complète : sans elle, aucun mandat ne se frappe. */
async function declareIssuer(): Promise<void> {
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
}

/** Bascule l'émetteur en CORE — seul formulaire qui imprime les zones 14 et 19. */
async function useCoreScheme(): Promise<void> {
  const entity = await ctx.prisma.legalEntity.findFirstOrThrow();
  await staff()
    .put(`/admin/accounting/legal-entities/${entity.id}/mandate-scheme`)
    .send({ scheme: "CORE" })
    .expect(204);
}

async function openFlag(): Promise<void> {
  await staff().put("/admin/feature-access/customerMandate").send({ value: "open" }).expect(204);
}

const optionsUrl = (id = companyId): string => `/companies/${id}/mandate-options`;

/** Les réécritures des zones journalisées pour la société — brouillon ou pas. */
async function optionsFacts(): Promise<readonly unknown[]> {
  const rows = await ctx.prisma.activityEvent.findMany({
    where: { type: "payment_mandate.options_changed" },
    orderBy: { occurredAt: "asc" },
  });
  return rows.map((row) => row.payload);
}
const mandateUrl = (): string => `/companies/${companyId}/mandate`;

async function readOptions(sub = OWNER): Promise<CustomerMandateOptionsSectionView> {
  return jsonBody<CustomerMandateOptionsSectionView>(
    await ctx.asSub(sub).get(optionsUrl()).expect(200),
  );
}

async function mint(): Promise<CustomerMandateView> {
  return jsonBody<CustomerMandateView>(await ctx.asSub(OWNER).post(mandateUrl()).expect(200));
}

beforeEach(async () => {
  await ctx.reset();
  companyId = (await createCompany(ctx.prisma)).id;
  neighbourId = (await createCompany(ctx.prisma)).id;
  await member(OWNER, companyId, CustomerRole.owner);
  await member(BILLING, companyId, CustomerRole.billing);
  await member(ADMIN, companyId, CustomerRole.admin);
  await member(ORDERS, companyId, CustomerRole.orders);
  // Détenteur d'une AUTRE société : un vrai rôle, mais pas ici.
  await member(OUTSIDER, neighbourId, CustomerRole.owner);
});

describe("le seuil — mur, puis drapeau", () => {
  beforeEach(async () => {
    await ctx.asSub(OWNER).put(`/companies/${companyId}/bank-account`).send(RIB).expect(204);
  });

  it("refuse GET et PUT en 409 au détenteur tant que le drapeau est fermé", async () => {
    for (const call of [
      () => ctx.asSub(OWNER).get(optionsUrl()),
      () => ctx.asSub(OWNER).put(optionsUrl()).send(OPTIONS),
    ]) {
      const response = await call().expect(409);
      expect(jsonBody<{ code: string }>(response).code).toBe("payments.mandate.customer_closed");
    }
  });

  /** 🔴 L'ordre : le mur passe AVANT le drapeau — « fermé » dirait que la société existe. */
  it("répond 404 au détenteur voisin et 403 aux autres rôles, drapeau fermé comme ouvert", async () => {
    for (const open of [false, true]) {
      if (open) {
        await openFlag();
      }
      await ctx.asSub(OUTSIDER).get(optionsUrl()).expect(404);
      await ctx.asSub(OUTSIDER).put(optionsUrl()).send(OPTIONS).expect(404);
      for (const sub of [ADMIN, ORDERS]) {
        await ctx.asSub(sub).get(optionsUrl()).expect(403);
        await ctx.asSub(sub).put(optionsUrl()).send(OPTIONS).expect(403);
      }
    }
  });
});

describe("les zones — drapeau ouvert", () => {
  beforeEach(openFlag);

  it("rend `{ options: null }` sans RIB, et refuse le PUT en 404", async () => {
    expect(await readOptions()).toEqual({
      options: null,
      issuerScheme: null,
      mintBlockers: ["bank_account_missing", "issuer_missing"],
    });

    const response = await ctx.asSub(OWNER).put(optionsUrl()).send(OPTIONS).expect(404);
    expect(jsonBody<{ code: string }>(response).code).toBe("payments.bank_account.missing");
    expect(await optionsFacts()).toEqual([]);
  });

  it.each([
    ["le détenteur", OWNER],
    ["le rôle facturation", BILLING],
  ])("%s écrit les zones, et la relecture les rend", async (_label, sub) => {
    await ctx.asSub(OWNER).put(`/companies/${companyId}/bank-account`).send(RIB).expect(204);
    expect(await readOptions(sub)).toEqual({
      options: { debtorReference: "", contractNumber: "" },
      issuerScheme: null,
      mintBlockers: ["issuer_missing"],
    });

    await ctx.asSub(sub).put(optionsUrl()).send(OPTIONS).expect(204);

    expect(await readOptions(sub)).toEqual({
      options: OPTIONS,
      issuerScheme: null,
      mintBlockers: ["issuer_missing"],
    });
    // Plan §10 (2026-09-14) : journalisé même sans brouillon, avec qui et quoi.
    expect(await optionsFacts()).toEqual([{ companyId, ...OPTIONS, via: "customer" }]);
  });

  it("révoque le brouillon CORE existant, trace la cause et sonne l'équipe", async () => {
    await ctx.asSub(OWNER).put(`/companies/${companyId}/bank-account`).send(RIB).expect(204);
    await declareIssuer();
    await useCoreScheme();
    const draft = await mint();

    await ctx.asSub(BILLING).put(optionsUrl()).send(OPTIONS).expect(204);

    const after = jsonBody<CustomerMandateView>(
      await ctx.asSub(OWNER).get(mandateUrl()).expect(200),
    );
    expect(after).toMatchObject({ id: draft.id, status: "revoked" });
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "payment_mandate.draft_voided", subjectId: draft.id },
    });
    expect(facts.map((fact) => fact.payload)).toEqual([
      expect.objectContaining({
        reference: draft.reference,
        cause: "mandate_options_changed",
        via: "customer",
      }),
    ]);
    expect(await optionsFacts()).toEqual([{ companyId, ...OPTIONS, via: "customer" }]);
    expect(
      await ctx.prisma.staffNotification.count({ where: { kind: "payment_mandate.draft_voided" } }),
    ).toBe(1);
  });

  /**
   * Plan mandat deux schémas §10, Q2 (2026-09-15) : le formulaire
   * interentreprises n'imprime pas ces zones — le brouillon reste signable, et
   * l'écran lit `issuerScheme` pour masquer la carte.
   */
  it("ne révoque PAS un brouillon interentreprises, et annonce le schéma de l'émetteur", async () => {
    await ctx.asSub(OWNER).put(`/companies/${companyId}/bank-account`).send(RIB).expect(204);
    await declareIssuer();
    const draft = await mint();

    await ctx.asSub(BILLING).put(optionsUrl()).send(OPTIONS).expect(204);

    const after = jsonBody<CustomerMandateView>(
      await ctx.asSub(OWNER).get(mandateUrl()).expect(200),
    );
    expect(after).toMatchObject({ id: draft.id, status: "draft" });
    expect(await readOptions()).toEqual({
      options: OPTIONS,
      issuerScheme: "B2B",
      mintBlockers: [],
    });
    expect(await optionsFacts()).toEqual([{ companyId, ...OPTIONS, via: "customer" }]);
    expect(
      await ctx.prisma.activityEvent.count({ where: { type: "payment_mandate.draft_voided" } }),
    ).toBe(0);
  });

  it("refuse le PUT en 409 sous un mandat actif, sans rien réécrire", async () => {
    await ctx.asSub(OWNER).put(`/companies/${companyId}/bank-account`).send(RIB).expect(204);
    await declareIssuer();
    const draft = await mint();
    await ctx.asSub(OWNER).put(`${mandateUrl()}/proof`).attach("file", PDF, "scan.pdf").expect(204);
    const section = jsonBody<MandateSectionView>(
      await staff().get(`/admin/companies/${companyId}/mandate`).expect(200),
    );
    await staff()
      .put(`/admin/companies/${companyId}/mandate/${draft.id}/signature`)
      .send({ signedAt: ON_PAPER, proofRevision: section.mandate?.proofRevision })
      .expect(204);

    const response = await ctx.asSub(OWNER).put(optionsUrl()).send(OPTIONS).expect(409);

    expect(jsonBody<{ code: string }>(response).code).toBe(
      "payments.mandate_options.bound_to_active_mandate",
    );
    expect(await readOptions()).toEqual({
      options: { debtorReference: "", contractNumber: "" },
      issuerScheme: "B2B",
      mintBlockers: [],
    });
    expect(await optionsFacts()).toEqual([]);
    const mandate = jsonBody<CustomerMandateView>(
      await ctx.asSub(OWNER).get(mandateUrl()).expect(200),
    );
    expect(mandate.status).toBe("active");
  });
});
