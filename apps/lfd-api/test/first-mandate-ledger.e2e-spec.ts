/**
 * E2E du **verrou du créancier imprimé** — plan
 * `documentation/comptabilite/plan-restes-du-mandat.md` §3, §7 #6 et §8 (lot B).
 *
 * Ce que ces e2e éprouvent et qu'aucun test unitaire ne peut prouver :
 *
 * - que la frappe pose `first_mandate_issued_at` dans la VRAIE ligne, par la
 *   vraie transaction ;
 * - que l'écriture est conditionnée EN BASE : une seconde frappe ne déplace pas
 *   le moment du gel ;
 * - 🔴 et que `save` de l'entité ne peut plus l'effacer — le trou que la
 *   contradiction a trouvé : une entité chargée avant la frappe et sauvée après
 *   réécrivait toute la ligne, verrou compris.
 *
 * Une seule frontière doublée : le verifier staff.
 */
import type { LegalEntityView } from "@lfd/contracts";

import { LegalEntityRepository } from "../src/b2b/accounting/domain/ports/legal-entity.repository.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

/** Le RIB d'un client, complet pour un mandat interentreprises. */
const RIB = {
  iban: "FR1420041010050500013M02606",
  bic: "CEPAFRPP751",
  holder: "Refuge du Col SARL",
  holderLegalForm: "SARL",
  line1: "12 rue des Alpages",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};

/** Le compte créancier, tel qu'il sera imprimé sur chaque mandat. */
const CREDITOR_ACCOUNT = {
  iban: "FR7630006000011234567890189",
  bic: "CEPAFRPP751",
  holder: "Crazeativity",
  line1: "Route de la Balme",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;
let issuerId: string;

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
  issuerId = await declareIssuer();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Une entité émettrice complète : sans elle, aucun mandat ne se frappe. */
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
    .send(CREDITOR_ACCOUNT)
    .expect(204);
  return id;
}

/** Une société cliente avec son RIB : prête à recevoir un mandat. */
async function companyWithRib(): Promise<string> {
  const { id } = await createCompany(ctx.prisma);
  await staff().put(`/admin/companies/${id}/bank-account`).send(RIB).expect(204);
  return id;
}

async function mintFor(companyId: string): Promise<void> {
  await staff().post(`/admin/companies/${companyId}/mandate`).expect(201);
}

async function lockOf(): Promise<Date | null> {
  const row = await ctx.prisma.legalEntity.findUniqueOrThrow({ where: { id: issuerId } });
  return row.firstMandateIssuedAt;
}

describe("Le verrou du créancier imprimé", () => {
  it("la première frappe pose le verrou, et la fiche le dit", async () => {
    expect(await lockOf()).toBeNull();

    await mintFor(await companyWithRib());

    expect(await lockOf()).not.toBeNull();
    const view = jsonBody<LegalEntityView>(
      await staff().get(`/admin/accounting/legal-entities/${issuerId}`).expect(200),
    );
    expect(view.creditorIdentityFrozen).toBe(true);
  });

  /** C'est le PREMIER qui compte : le déplacer changerait la seule chose que la colonne dit. */
  it("une seconde frappe ne déplace pas le moment du gel", async () => {
    await mintFor(await companyWithRib());
    const first = await lockOf();

    await mintFor(await companyWithRib());

    expect(await lockOf()).toEqual(first);
  });

  it("une frappe refusée ne pose pas le verrou", async () => {
    const { id } = await createCompany(ctx.prisma);

    // Sans RIB, la frappe refuse avant toute écriture.
    await staff().post(`/admin/companies/${id}/mandate`).expect(409);

    expect(await lockOf()).toBeNull();
  });

  it("après une frappe, corriger le titulaire du créancier est refusé en 409", async () => {
    await mintFor(await companyWithRib());

    const response = await staff()
      .put(`/admin/accounting/legal-entities/${issuerId}/creditor-account`)
      .send({ ...CREDITOR_ACCOUNT, holder: "Autre Société" })
      .expect(409);

    expect(jsonBody<{ code: string }>(response).code).toBe("accounting.creditor_identity.frozen");
    const row = await ctx.prisma.legalEntity.findUniqueOrThrow({ where: { id: issuerId } });
    expect(row.creditorAccountHolder).toBe("Crazeativity");
  });

  /**
   * 🔴 Régression prévenue (plan `plan-restes-du-mandat.md` §7 #6) : `save`
   * réécrivait toutes les colonnes. Un geste staff qui avait chargé l'entité
   * AVANT une frappe concurrente la sauvait APRÈS, et remettait le verrou à
   * `null` — le créancier imprimé redevenait corrigeable sous un mandat frappé.
   */
  it("une entité chargée avant la frappe et sauvée après ne remet pas le verrou à null", async () => {
    const repository = ctx.app.get(LegalEntityRepository);
    const stale = await repository.load(issuerId);
    expect(stale?.creditorIdentityFrozen).toBe(false);

    await mintFor(await companyWithRib());
    await repository.save(stale!);

    expect(await lockOf()).not.toBeNull();
  });
});
