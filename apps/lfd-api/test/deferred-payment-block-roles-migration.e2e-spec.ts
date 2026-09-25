/**
 * E2E des **droits migrés du blocage du prélèvement** —
 * `20260925160100_le_blocage_du_prelevement_est_accorde`, rejouée (plan
 * `documentation/comptabilite/plan-blocage-prelevement-et-liens-de-paiement.md` §1).
 *
 * 🔴 Pourquoi ce test existe : le harnais réécrit `staff_role_definitions`
 * depuis `ROLE_GRANTS` à chaque `reset()`. Aucune autre suite ne verrait donc
 * une migration qui oublie d'y accorder `b2b_deferred_payment_block` — et
 * l'écran des rôles, qui lit la table, montrerait en production une
 * comptabilité sans le geste que la route lui ouvre.
 *
 * Le guard résout depuis `ROLE_GRANTS`, pas depuis cette table (même constat
 * que `storefront-roles-migration.e2e-spec.ts`, 2026-09-24) : ce test garde
 * l'accord table ↔ contrat, l'ouverture de la route est éprouvée par
 * `direct-debit-blocks.e2e-spec.ts`.
 *
 * On REJOUE les ordres lus dans le fichier de migration plutôt que de lire la
 * table avant tout reset — même mécanique, même raison que la suite vitrine.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ROLE_GRANTS, staffRoleSchema } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20260925160100_le_blocage_du_prelevement_est_accorde/migration.sql",
);

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

/** Les ordres de la migration qui touchent les rôles — lus dans le fichier. */
function grantStatements(): readonly string[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const statements = sql.match(/^UPDATE "public"\."staff_role_definitions"[^;]*;/gmu) ?? [];
  if (statements.length !== 2) {
    throw new Error(
      `Deux UPDATE de staff_role_definitions attendus dans la migration, ${String(statements.length)} trouvés.`,
    );
  }
  return statements;
}

/** La table telle qu'avant la migration : aucun rôle ne porte `b2b_deferred_payment_block`. */
async function beforeMigration(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(`
    UPDATE "public"."staff_role_definitions"
    SET "grants" = COALESCE(
      (SELECT jsonb_agg(entry) FROM jsonb_array_elements("grants") AS entry
       WHERE entry->>'resource' IS DISTINCT FROM 'b2b_deferred_payment_block'),
      '[]'::jsonb)`);
}

async function replayMigration(): Promise<void> {
  for (const statement of grantStatements()) {
    await ctx.prisma.$executeRawUnsafe(statement);
  }
}

/** Les entrées `b2b_deferred_payment_block` de chaque rôle, telles que la table les porte. */
async function blockGrants(): Promise<Record<string, readonly string[]>> {
  const rows = await ctx.prisma.$queryRawUnsafe<{ key: string; actions: string[] }[]>(`
    SELECT "key",
           COALESCE(array_agg(entry->>'action') FILTER (WHERE entry->>'resource' = 'b2b_deferred_payment_block'), '{}') AS actions
    FROM "public"."staff_role_definitions"
    LEFT JOIN LATERAL jsonb_array_elements("grants") AS entry ON true
    GROUP BY "key"`);
  return Object.fromEntries(rows.map((row) => [row.key, row.actions]));
}

describe("la migration accorde `b2b_deferred_payment_block` — la table, pas seulement le code", () => {
  it("donne `b2b_deferred_payment_block: write` à admin et comptabilite, et à eux seuls — comme le contrat", async () => {
    await beforeMigration();
    // Le point de départ n'est pas vide par hasard : sans lui, le test
    // passerait même si la migration n'accordait rien.
    expect((await blockGrants())["comptabilite"]).toEqual([]);

    await replayMigration();

    const grants = await blockGrants();
    for (const role of staffRoleSchema.options) {
      const expected = ROLE_GRANTS[role].b2b_deferred_payment_block;
      expect({ role, actions: grants[role] ?? [] }).toEqual({
        role,
        actions: expected === undefined ? [] : [expected],
      });
    }
    expect(grants["admin"]).toEqual(["write"]);
    expect(grants["comptabilite"]).toEqual(["write"]);
  });

  it("rejouée sur une base à jour, n'ajoute rien — un doublon jsonb passerait en silence", async () => {
    await beforeMigration();

    await replayMigration();
    await replayMigration();

    const grants = await blockGrants();
    expect(grants["admin"]).toEqual(["write"]);
    expect(grants["comptabilite"]).toEqual(["write"]);
  });
});
