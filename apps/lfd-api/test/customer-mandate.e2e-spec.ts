/**
 * E2E du **mandat SEPA côté client** — la carte mandat de `/mon-compte`.
 *
 * Plan : `documentation/b2b/plan-mandat-client.md`, contrat en fin de §9.
 *
 * Ce que seul le vrai SQL prouve, et que les unitaires ne peuvent pas :
 *
 * - le mur lit le **vrai** rattachement : détenteur et facturation passent,
 *   `admin` et `orders` reçoivent 403, la société voisine 404 ;
 * - le drapeau `customerMandate` est lu dans la **vraie** table des
 *   dérogations, et ferme chaque route en 409 — après le mur, jamais avant ;
 * - le PDF sort **nominatif** : la RUM du brouillon, sans « EXEMPLE » ;
 * - l'index partiel `one_draft_per_company` est traduit, pas remonté en 500 ;
 * - le parcours complet — frappe, dépôt, cloche, activation staff — écrit les
 *   faits au journal et verrouille ensuite ce qui doit l'être.
 *
 * Frontières doublées : les deux verifiers de jetons (le jeton EST le `sub`).
 * Le stockage objet et le chiffrement sont les vrais.
 */
import { Buffer } from "node:buffer";

import type { CustomerMandateView, MandateSectionView } from "@lfd/contracts";

import { drawnText } from "../src/b2b/accounting/domain/services/__tests__/pdf-drawn-text.js";
import { mintMandate } from "../src/b2b/payments/domain/entities/payment-mandate.js";
import { MandateDraftAlreadyExistsError } from "../src/b2b/payments/domain/errors/mandate-errors.js";
import { PaymentMandateRepository } from "../src/b2b/payments/domain/payment-mandate.repository.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const IBAN = "FR1420041010050500013M02606";
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

/** Une entité émettrice complète : identité, ICS, compte créancier. */
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

async function openFlag(): Promise<void> {
  await staff().put("/admin/feature-access/customerMandate").send({ value: "open" }).expect(204);
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
  await declareIssuer();
  await ctx.asSub(OWNER).put(`/companies/${companyId}/bank-account`).send(RIB).expect(204);
});

const base = (id = companyId): string => `/companies/${id}/mandate`;

/** Les quatre routes du contrat, jouées par une même personne. */
function everyRoute(sub: string, id = companyId) {
  return [
    ["GET mandate", () => ctx.asSub(sub).get(base(id))],
    ["POST mandate", () => ctx.asSub(sub).post(base(id))],
    ["GET document.pdf", () => ctx.asSub(sub).get(`${base(id)}/document.pdf`)],
    [
      "PUT proof",
      () =>
        ctx
          .asSub(sub)
          .put(`${base(id)}/proof`)
          .attach("file", PDF, "scan.pdf"),
    ],
  ] as const;
}

async function mint(sub = OWNER): Promise<CustomerMandateView> {
  return jsonBody<CustomerMandateView>(await ctx.asSub(sub).post(base()).expect(200));
}

async function journal(type: string): Promise<readonly Record<string, unknown>[]> {
  const rows = await ctx.prisma.activityEvent.findMany({
    where: { type, subjectType: "payment_mandate" },
    orderBy: { occurredAt: "asc" },
  });
  return rows.map((row) => row.payload as Record<string, unknown>);
}

describe("le drapeau customerMandate — fermé par défaut, sur CHAQUE route", () => {
  it("refuse les quatre routes en 409 au détenteur tant qu'il est fermé", async () => {
    for (const [, call] of everyRoute(OWNER)) {
      const response = await call().expect(409);
      expect(jsonBody<{ code: string }>(response).code).toBe("payments.mandate.customer_closed");
    }
    expect(await ctx.prisma.paymentMandate.count()).toBe(0);
  });

  /** 🔴 L'ordre : le mur passe AVANT le drapeau — « fermé » dirait que la société existe. */
  it("répond 404 à la société voisine et 403 aux autres rôles, même drapeau fermé", async () => {
    for (const [, call] of everyRoute(OUTSIDER)) {
      await call().expect(404);
    }
    for (const sub of [ADMIN, ORDERS]) {
      for (const [, call] of everyRoute(sub)) {
        await call().expect(403);
      }
    }
  });

  it("refuse d'exempter une adresse sur cette clé (409)", async () => {
    await staff()
      .post("/admin/feature-access/customerMandate/exemptions")
      .send({ email: "testeur@exemple.fr" })
      .expect(409);
  });
});

describe("le mur — drapeau ouvert", () => {
  beforeEach(openFlag);

  it.each([
    ["le détenteur", OWNER],
    ["le rôle facturation", BILLING],
  ])("%s génère, relit, et retrouve le même brouillon au second clic", async (_label, sub) => {
    const first = await mint(sub);
    const again = await mint(sub);

    expect(again.id).toBe(first.id);
    expect(first.reference).toMatch(/^LFC-/u);
    expect(first).toEqual({
      id: first.id,
      reference: first.reference,
      status: "draft",
      hasProof: false,
      proofFileName: "",
      acceptedAt: null,
    });
    const read = await ctx.asSub(sub).get(base()).expect(200);
    expect(jsonBody<CustomerMandateView>(read)).toEqual(first);
    expect(await ctx.prisma.paymentMandate.count({ where: { companyId } })).toBe(1);
  });

  it("rend un vrai `null` JSON quand la société n'a jamais eu de mandat", async () => {
    const response = await ctx.asSub(OWNER).get(base()).expect(200);

    expect(response.headers["content-type"]).toMatch(/application\/json/u);
    expect(response.text).toBe("null");
  });

  it.each([ADMIN, ORDERS])("refuse %s en 403 sur chaque route", async (sub) => {
    for (const [, call] of everyRoute(sub)) {
      await call().expect(403);
    }
  });

  it("répond 404 au détenteur d'une société voisine, sur chaque route", async () => {
    await mint();
    for (const [, call] of everyRoute(OUTSIDER)) {
      await call().expect(404);
    }
  });
});

describe("pas de mandat sans RIB — client ET staff", () => {
  beforeEach(openFlag);

  it("refuse la frappe en 409 aux deux, sans RUM frappée", async () => {
    await member("auth0|voisin-billing", neighbourId, CustomerRole.billing);

    await ctx.asSub(OUTSIDER).post(base(neighbourId)).expect(409);
    await staff().post(`/admin/companies/${neighbourId}/mandate`).expect(409);
    expect(await ctx.prisma.paymentMandate.count({ where: { companyId: neighbourId } })).toBe(0);
  });
});

describe("le PDF — nominatif, brouillon seulement", () => {
  beforeEach(openFlag);

  it("porte la RUM du brouillon et pas la mention EXEMPLE", async () => {
    const { reference } = await mint();

    const response = await ctx
      .asSub(BILLING)
      .get(`${base()}/document.pdf`)
      .buffer(true)
      .expect(200)
      .expect("Content-Type", /application\/pdf/u);

    const text = drawnText(Buffer.from(response.body as Buffer));
    expect(text).toContain(reference);
    expect(text).not.toContain("EXEMPLE");
    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(response.headers["content-disposition"]).not.toContain("apercu");
  });

  it("s'affiche dans l'onglet avec ?inline=1", async () => {
    await mint();

    const response = await ctx.asSub(OWNER).get(`${base()}/document.pdf?inline=1`).expect(200);
    expect(response.headers["content-disposition"]).toContain("inline");
  });

  it("refuse en 404 tant qu'aucun mandat n'est généré — jamais l'exemplaire", async () => {
    await ctx.asSub(OWNER).get(`${base()}/document.pdf`).expect(404);
  });
});

describe("le parcours complet — frappe, dépôt client, activation staff", () => {
  beforeEach(openFlag);

  it("trace chaque geste, prévient l'équipe, puis verrouille le mandat actif", async () => {
    const draft = await mint();

    await ctx.asSub(BILLING).put(`${base()}/proof`).attach("file", PDF, "scan.pdf").expect(204);

    const proven = jsonBody<CustomerMandateView>(await ctx.asSub(OWNER).get(base()).expect(200));
    expect(proven).toMatchObject({ status: "draft", hasProof: true, proofFileName: "scan.pdf" });

    const bell = await ctx.prisma.staffNotification.findMany({
      where: { kind: "payment_mandate.proof_attached" },
    });
    expect(bell).toHaveLength(1);
    expect(bell[0]?.link).toBe(`/comptes-clients/${companyId}/informations`);

    // Le staff relit la pièce DE CE mandat, puis l'active.
    const proof = await staff()
      .get(`/admin/companies/${companyId}/mandate/${draft.id}/proof`)
      .buffer(true)
      .expect(200);
    expect(Buffer.from(proof.body as Buffer).equals(PDF)).toBe(true);
    await staff()
      .put(`/admin/companies/${companyId}/mandate/${draft.id}/signature`)
      .send({ signedAt: ON_PAPER })
      .expect(204);

    const active = jsonBody<CustomerMandateView>(await ctx.asSub(OWNER).get(base()).expect(200));
    expect(active.status).toBe("active");
    expect(active.acceptedAt?.slice(0, 4)).toBe(ON_PAPER.slice(0, 4));

    expect(await journal("payment_mandate.minted")).toEqual([
      expect.objectContaining({ reference: draft.reference, via: "customer" }),
    ]);
    expect(await journal("payment_mandate.proof_attached")).toEqual([
      expect.objectContaining({ fileName: "scan.pdf", via: "customer" }),
    ]);
    expect(await journal("payment_mandate.signed")).toEqual([
      expect.objectContaining({ signedAt: ON_PAPER }),
    ]);

    // Ce qui est désormais verrouillé côté client.
    await ctx.asSub(OWNER).post(base()).expect(409);
    await ctx.asSub(OWNER).put(`${base()}/proof`).attach("file", PDF, "autre.pdf").expect(409);
    await ctx.asSub(OWNER).get(`${base()}/document.pdf`).expect(404);
    await ctx
      .asSub(OWNER)
      .put(`/companies/${companyId}/bank-account`)
      .send({ ...RIB, holder: "Refuge SAS" })
      .expect(409);
  });

  it("refuse le dépôt client quand aucun mandat n'existe (404)", async () => {
    await ctx.asSub(OWNER).put(`${base()}/proof`).attach("file", PDF, "scan.pdf").expect(404);
  });

  /** Déprécié le 2026-09-14 : un back-office déjà chargé l'appelle encore. */
  it("sert encore la pièce du mandat courant par l'ancienne route staff", async () => {
    await mint();
    await ctx.asSub(OWNER).put(`${base()}/proof`).attach("file", PDF, "scan.pdf").expect(204);

    await staff().get(`/admin/companies/${companyId}/mandate/proof`).expect(200);
  });
});

describe("le brouillon devient caduc quand son papier change", () => {
  beforeEach(openFlag);

  it("révoque le brouillon sur une réécriture du RIB par le client, trace et sonne", async () => {
    const draft = await mint();

    await ctx
      .asSub(BILLING)
      .put(`/companies/${companyId}/bank-account`)
      .send({ ...RIB, holder: "Refuge du Col SAS" })
      .expect(204);

    const after = jsonBody<CustomerMandateView>(await ctx.asSub(OWNER).get(base()).expect(200));
    expect(after).toMatchObject({ id: draft.id, status: "revoked" });
    expect(await journal("payment_mandate.draft_voided")).toEqual([
      expect.objectContaining({
        reference: draft.reference,
        cause: "bank_account_changed",
        via: "customer",
      }),
    ]);
    expect(
      await ctx.prisma.staffNotification.count({ where: { kind: "payment_mandate.draft_voided" } }),
    ).toBe(1);
    // Le client régénère : une RUM neuve, pas l'ancienne.
    expect((await mint()).reference).not.toBe(draft.reference);
  });

  it("révoque le brouillon sur une réécriture des zones 14/19 par le staff", async () => {
    const draft = await mint();

    await staff()
      .put(`/admin/companies/${companyId}/mandate-options`)
      .send({ debtorReference: "C-9P2X4B", contractNumber: "CT-42" })
      .expect(204);

    const section = jsonBody<MandateSectionView>(
      await staff().get(`/admin/companies/${companyId}/mandate`).expect(200),
    );
    expect(section.mandate).toMatchObject({ id: draft.id, status: "revoked" });
    // Plan §10 (2026-09-14) : la révocation dit qui a réécrit, et la réécriture a son fait.
    expect(await journal("payment_mandate.draft_voided")).toEqual([
      expect.objectContaining({ cause: "mandate_options_changed", via: "staff" }),
    ]);
    const rewrites = await ctx.prisma.activityEvent.findMany({
      where: { type: "payment_mandate.options_changed" },
    });
    expect(rewrites.map((row) => row.payload)).toEqual([
      { companyId, debtorReference: "C-9P2X4B", contractNumber: "CT-42", via: "staff" },
    ]);
  });
});

describe("l'index d'unicité du brouillon, traduit par l'adaptateur", () => {
  /** Régression prévenue (plan §6 #5) : la seconde frappe simultanée remontait en 500. */
  it("traduit la violation en MandateDraftAlreadyExistsError, pas en erreur brute", async () => {
    const repository = ctx.app.get(PaymentMandateRepository);
    const issuer = await ctx.prisma.legalEntity.findFirstOrThrow({ select: { id: true } });
    const draft = (reference: string) =>
      mintMandate({ companyId, creditorId: issuer.id, reference });

    await repository.create(draft("LFC-E2E-000001-AAAAAA"));

    await expect(repository.create(draft("LFC-E2E-000002-BBBBBB"))).rejects.toBeInstanceOf(
      MandateDraftAlreadyExistsError,
    );
  });
});
