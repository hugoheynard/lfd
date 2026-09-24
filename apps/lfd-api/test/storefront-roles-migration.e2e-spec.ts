/**
 * E2E des **droits migrés de la vitrine** — `20260924100100_la_vitrine_s_enregistre`,
 * section 7, rejouée (plan `documentation/order/plan-vitrine-enregistrement.md`, D7).
 *
 * 🔴 Pourquoi ce test existe : le harnais réécrit `staff_role_definitions`
 * depuis `ROLE_GRANTS` à chaque `reset()`. Aucune autre suite ne verrait donc
 * une migration qui oublie d'y accorder `b2b_storefront` (vitruve, B1) — et
 * l'écran des rôles, qui lit la table, montrerait en production une
 * communication sans vitrine.
 *
 * ⚠️ Le plan (D7) présente la table comme la source du GUARD. Elle ne l'est
 * pas : le guard résout depuis `ROLE_GRANTS` (`resolveStaffPermissions`,
 * `staff/permissions/prisma-staff-access.resolver.ts`, vérifié le 2026-09-24).
 * Ce test garde donc l'accord table ↔ contrat, pas l'ouverture de la route —
 * que `storefront.e2e-spec.ts` éprouve par HTTP.
 *
 * ⚠️ Pourquoi on REJOUE plutôt qu'on ne lit la table « avant tout reset » :
 * chaque worker e2e garde sa base d'une suite à l'autre, et la première suite
 * qui démarre réécrit les rôles depuis le code. L'état laissé par la migration
 * n'existe donc qu'au tout premier boot d'une base neuve — rien ne garantit
 * que cette suite-ci le verra. On remet la table dans l'état d'AVANT la
 * migration, on exécute les ordres LUS dans le fichier de migration, et on
 * confronte le résultat au contrat : c'est ce SQL-là qu'on éprouve, pas une
 * copie (même mécanique que `staff-journal-backfill` et `company-siren`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ROLE_GRANTS, staffRoleSchema } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20260924100100_la_vitrine_s_enregistre/migration.sql",
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

/** La table telle qu'avant la migration : aucun rôle ne porte `b2b_storefront`. */
async function beforeMigration(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(`
    UPDATE "public"."staff_role_definitions"
    SET "grants" = COALESCE(
      (SELECT jsonb_agg(entry) FROM jsonb_array_elements("grants") AS entry
       WHERE entry->>'resource' IS DISTINCT FROM 'b2b_storefront'),
      '[]'::jsonb)`);
}

async function replayMigration(): Promise<void> {
  for (const statement of grantStatements()) {
    await ctx.prisma.$executeRawUnsafe(statement);
  }
}

/** Les entrées `b2b_storefront` de chaque rôle, telles que la table les porte. */
async function storefrontGrants(): Promise<Record<string, readonly string[]>> {
  const rows = await ctx.prisma.$queryRawUnsafe<{ key: string; actions: string[] }[]>(`
    SELECT "key",
           COALESCE(array_agg(entry->>'action') FILTER (WHERE entry->>'resource' = 'b2b_storefront'), '{}') AS actions
    FROM "public"."staff_role_definitions"
    LEFT JOIN LATERAL jsonb_array_elements("grants") AS entry ON true
    GROUP BY "key"`);
  return Object.fromEntries(rows.map((row) => [row.key, row.actions]));
}

describe("la migration accorde `b2b_storefront` — la table, pas seulement le code", () => {
  it("donne `storefront: write` à admin et communication, et à eux seuls — comme le contrat", async () => {
    await beforeMigration();
    // Le point de départ n'est pas vide par hasard : sans lui, le test
    // passerait même si la migration n'accordait rien.
    expect((await storefrontGrants())["communication"]).toEqual([]);

    await replayMigration();

    const grants = await storefrontGrants();
    for (const role of staffRoleSchema.options) {
      const expected = ROLE_GRANTS[role].b2b_storefront;
      expect({ role, actions: grants[role] ?? [] }).toEqual({
        role,
        actions: expected === undefined ? [] : [expected],
      });
    }
    expect(grants["admin"]).toEqual(["write"]);
    expect(grants["communication"]).toEqual(["write"]);
  });

  it("rejouée sur une base à jour, n'ajoute rien — un doublon jsonb passerait en silence", async () => {
    await beforeMigration();

    await replayMigration();
    await replayMigration();

    const grants = await storefrontGrants();
    expect(grants["admin"]).toEqual(["write"]);
    expect(grants["communication"]).toEqual(["write"]);
  });
});
