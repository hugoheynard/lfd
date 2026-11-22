/**
 * E2E des vues d'un compte supprimé (`archived_at`, « Supprimer le compte ») —
 * `supprimer-un-compte.md`, § 2.4.
 *
 * Ce que seul le vrai SQL prouve :
 * - la liste staff (`GET /admin/companies`), dont l'écran tire sa recherche et
 *   ses sélecteurs, écarte un compte supprimé ;
 * - `?archived=only` ne rend QUE les supprimés, avec `archivedAt` ;
 * - un compte RÉSILIÉ reste listé (Hugo, 2026-11-22) ;
 * - le portefeuille ne le compte plus ;
 * - une valeur de filtre inconnue est refusée plutôt que lue comme l'absence.
 *
 * Seule frontière doublée : la signature du jeton staff.
 */
import type { AdminCompanyView, CustomerPortfolioView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

/** Le jeton porteur EST le `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
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

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub(E2E_STAFF_SUB);
}

async function list(query = ""): Promise<readonly AdminCompanyView[]> {
  const response = await staff().get(`/admin/companies${query}`).expect(200);
  return jsonBody<readonly AdminCompanyView[]>(response);
}

/** Supprime par la route : la vraie transaction, le vrai CHECK. */
async function archive(companyId: string): Promise<void> {
  await staff()
    .post(`/admin/companies/${companyId}/archive`)
    .send({ reason: "Doublon" })
    .expect(204);
}

/** Trois comptes : un ouvert, un supprimé (resté `active`), un résilié. */
async function seedThree(): Promise<{ open: string; archived: string; terminated: string }> {
  const open = await createCompany(ctx.prisma, { raisonSociale: "Ouvert SAS" });
  const archived = await createCompany(ctx.prisma, { raisonSociale: "Doublon SAS" });
  const terminated = await createCompany(ctx.prisma, {
    raisonSociale: "Résilié SAS",
    status: CompanyStatus.terminated,
  });
  await archive(archived.id);
  return { open: open.id, archived: archived.id, terminated: terminated.id };
}

describe("un compte supprimé quitte les vues du staff", () => {
  it("la liste l'écarte, et garde le résilié", async () => {
    const ids = await seedThree();

    const rows = await list();

    expect(rows.map((row) => row.id).sort()).toEqual([ids.open, ids.terminated].sort());
    expect(rows.every((row) => row.archivedAt === null)).toBe(true);
  });

  it("`archived=only` ne rend que lui, avec sa date", async () => {
    const ids = await seedThree();

    const rows = await list("?archived=only");

    expect(rows.map((row) => row.id)).toEqual([ids.archived]);
    expect(rows[0]?.archivedAt).not.toBeNull();
  });

  it("refuse une valeur de filtre inconnue plutôt que de montrer la mauvaise liste", async () => {
    await staff().get("/admin/companies?archived=all").expect(400);
  });

  it("le portefeuille ne le compte plus, même resté `active`", async () => {
    await seedThree();

    const response = await staff().get("/admin/companies/portfolio").expect(200);

    expect(jsonBody<CustomerPortfolioView>(response).active).toBe(1);
  });

  it("le désarchiver le remet dans la liste", async () => {
    const ids = await seedThree();

    await staff().post(`/admin/companies/${ids.archived}/unarchive`).expect(204);

    expect((await list()).map((row) => row.id)).toContain(ids.archived);
    expect(await list("?archived=only")).toEqual([]);
  });
});
