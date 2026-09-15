/**
 * E2E du **SIREN de la société** — plan `plan-mentions-obligatoires-du-mandat.md` §9.
 *
 * Ce que seuls ces e2e éprouvent : que les trois écritures du dépôt
 * (`declareOwnedBy`, `declareUnowned`, `save`) portent la colonne, que la
 * complétion client et la correction staff tiennent la règle jusqu'à la ligne
 * SQL, qu'un écran ancien qui n'envoie pas `siren` n'efface rien — et que le
 * remplissage de la migration, rejoué sur des valeurs connues, n'écrit jamais un
 * préfixe que le domaine refuserait.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { CreatedCompanyResponse } from "../src/b2b/account/http/companies.controller.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const SUB = "auth0|siren";
const STAFF = "staff-e2e";

/** SIRET dont le préfixe `812456788` est un SIREN valide. */
const SIRET = "81245678800023";
const SIREN = "812456788";
/** Un établissement d'une autre entreprise, au préfixe valide. */
const OTHER_SIRET = "73282932000074";
const OTHER_SIREN = "732829320";
/** SIRET valide dont le préfixe `812456789` n'est PAS un SIREN valide. */
const SIRET_INVALID_PREFIX = "81245678900021";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20260915120000_siren_et_forme_juridique_du_titulaire/migration.sql",
);

/** Staff doublé : accepte le jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: STAFF, scopes: [] }),
};

let ctx: E2eContext;

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

async function sirenOf(companyId: string): Promise<{ siret: string; siren: string }> {
  return ctx.prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { siret: true, siren: true },
  });
}

/** Une société dont le client connecté est gestionnaire. */
async function ownedCompany(siret: string, siren: string): Promise<string> {
  const user = await createUser(ctx.prisma, { auth0Sub: SUB });
  const company = await createCompany(ctx.prisma, {
    siret,
    siren,
    status: CompanyStatus.pending,
  });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  return company.id;
}

describe("création", () => {
  it("POST /companies créée avec SIRET ⇒ SIREN en base", async () => {
    await createUser(ctx.prisma, { auth0Sub: SUB, phone: "" });

    const created = await ctx
      .asSub(SUB)
      .post("/companies")
      .send({ enseigne: "Le Comptoir", siret: "812 456 788 00023" })
      .expect(201);

    expect(await sirenOf(jsonBody<CreatedCompanyResponse>(created).id)).toEqual({
      siret: SIRET,
      siren: SIREN,
    });
  });

  it("POST /admin/companies créée avec SIRET ⇒ SIREN en base", async () => {
    const created = await ctx
      .asSub(STAFF)
      .post("/admin/companies")
      .send({ enseigne: "Le Comptoir", siret: SIRET })
      .expect(201);

    expect(await sirenOf(jsonBody<{ id: string }>(created).id)).toEqual({
      siret: SIRET,
      siren: SIREN,
    });
  });

  it("refuse en 400 un SIREN qui contredit le SIRET, en nommant les deux", async () => {
    const refused = await ctx
      .asSub(STAFF)
      .post("/admin/companies")
      .send({ enseigne: "Le Comptoir", siret: SIRET, siren: OTHER_SIREN })
      .expect(400);

    expect(JSON.stringify(refused.body)).toContain(OTHER_SIREN);
    expect(await ctx.prisma.company.count()).toBe(0);
  });
});

describe("PATCH /companies/:id/identity — complétion client", () => {
  it("pose le SIREN quand le client complète son SIRET", async () => {
    const companyId = await ownedCompany("", "");

    await ctx
      .asSub(SUB)
      .patch(`/companies/${companyId}/identity`)
      .send({ enseigne: "Le Comptoir", siret: SIRET })
      .expect(204);

    expect(await sirenOf(companyId)).toEqual({ siret: SIRET, siren: SIREN });
  });

  it("ne réécrit pas un SIREN déjà posé", async () => {
    const companyId = await ownedCompany(SIRET_INVALID_PREFIX, OTHER_SIREN);

    await ctx
      .asSub(SUB)
      .patch(`/companies/${companyId}/identity`)
      .send({ enseigne: "Le Comptoir", siren: SIREN })
      .expect(204);

    expect((await sirenOf(companyId)).siren).toBe(OTHER_SIREN);
  });
});

describe("PATCH /admin/companies/:id/identity — correction staff", () => {
  it("un SIRET corrigé sans SIREN recalcule le SIREN, et le journal le porte", async () => {
    const company = await createCompany(ctx.prisma, { siret: SIRET });
    expect((await sirenOf(company.id)).siren).toBe(SIREN);

    await ctx
      .asSub(STAFF)
      .patch(`/admin/companies/${company.id}/identity`)
      .send({ enseigne: "Le Comptoir", siret: OTHER_SIRET, siren: OTHER_SIREN })
      .expect(204);

    expect(await sirenOf(company.id)).toEqual({ siret: OTHER_SIRET, siren: OTHER_SIREN });
    await ctx.drain();
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { subjectId: company.id, type: "company.identity_corrected" },
      select: { payload: true },
    });
    expect(fact.payload).toMatchObject({ siret: OTHER_SIRET, siren: OTHER_SIREN });
  });

  it("recalcule depuis le seul SIRET — l'écran d'avant n'envoyait que lui", async () => {
    const company = await createCompany(ctx.prisma, { siret: SIRET });

    await ctx
      .asSub(STAFF)
      .patch(`/admin/companies/${company.id}/identity`)
      .send({ enseigne: "Le Comptoir", siret: OTHER_SIRET })
      .expect(204);

    expect(await sirenOf(company.id)).toEqual({ siret: OTHER_SIRET, siren: OTHER_SIREN });
  });

  /**
   * Un onglet encore ouvert sur le bundle d'avant ne connaît pas `siren` : le
   * payload l'omet, le défaut vide ne doit rien réécrire.
   */
  it("un écran ancien, sans `siren`, n'efface pas le SIREN", async () => {
    const company = await createCompany(ctx.prisma, {
      siret: SIRET_INVALID_PREFIX,
      siren: OTHER_SIREN,
    });

    await ctx
      .asSub(STAFF)
      .patch(`/admin/companies/${company.id}/identity`)
      .send({ enseigne: "Le Comptoir", vatNumber: "", formeJuridique: "SARL" })
      .expect(204);

    expect(await sirenOf(company.id)).toEqual({
      siret: SIRET_INVALID_PREFIX,
      siren: OTHER_SIREN,
    });
  });
});

describe("remplissage de la migration", () => {
  /**
   * Régression : `left(siret, 9)` écrivait `812456789` pour `81245678900021`,
   * un SIREN que le domaine refuse au chargement (vitruve §8.1).
   */
  it("ne remplit le SIREN que depuis un préfixe valide, jamais depuis zéros", async () => {
    const valid = await createCompany(ctx.prisma, { siret: SIRET, siren: "" });
    const other = await createCompany(ctx.prisma, { siret: OTHER_SIRET, siren: "" });
    const invalid = await createCompany(ctx.prisma, { siret: SIRET_INVALID_PREFIX, siren: "" });
    const none = await createCompany(ctx.prisma, { siret: "", siren: "" });
    // Un SIREN déjà saisi n'est pas réécrit par le remplissage.
    const typed = await createCompany(ctx.prisma, {
      siret: "81245678800031",
      siren: OTHER_SIREN,
    });
    // Un SIRET tout à zéro ne passe plus le domaine, mais une ligne ancienne
    // peut le porter : le remplissage doit l'écarter lui-même.
    const zeros = await createCompany(ctx.prisma, { siret: "00000000000000", siren: "" });
    // Régression (lecteur de migrations, 2026-09-15) : le calcul de la clé
    // castait chaque caractère en `::int`, et Postgres peut l'évaluer AVANT le
    // filtre numérique — un seul SIRET mal saisi annulait toute la migration.
    const spaced = await createCompany(ctx.prisma, { siret: "732 829 320 00074", siren: "" });
    const lettered = await createCompany(ctx.prisma, { siret: "ABC45678900021", siren: "" });
    const short = await createCompany(ctx.prisma, { siret: "8124", siren: "" });

    await ctx.prisma.$executeRawUnsafe(fillStatement());

    expect((await sirenOf(valid.id)).siren).toBe(SIREN);
    expect((await sirenOf(other.id)).siren).toBe(OTHER_SIREN);
    expect((await sirenOf(invalid.id)).siren).toBe("");
    expect((await sirenOf(none.id)).siren).toBe("");
    expect((await sirenOf(typed.id)).siren).toBe(OTHER_SIREN);
    expect((await sirenOf(zeros.id)).siren).toBe("");
    expect((await sirenOf(spaced.id)).siren).toBe("");
    expect((await sirenOf(lettered.id)).siren).toBe("");
    expect((await sirenOf(short.id)).siren).toBe("");
  });
});

/** L'UPDATE de remplissage, lu dans la migration elle-même : on éprouve CE SQL-là. */
function fillStatement(): string {
  const sql = readFileSync(MIGRATION, "utf8");
  const start = sql.indexOf('UPDATE "public"."companies"');
  const end = sql.indexOf(";", start);
  if (start < 0 || end < 0) {
    throw new Error("Remplissage du SIREN introuvable dans la migration.");
  }
  return sql.slice(start, end);
}
