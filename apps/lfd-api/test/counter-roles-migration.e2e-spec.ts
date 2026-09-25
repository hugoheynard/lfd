/**
 * E2E des **droits migrés du Comptoir** — `20260926100100_le_comptoir_est_accorde`,
 * rejouée (plan `documentation/order/plan-commande-au-comptoir.md`, « Droits »).
 *
 * 🔴 Ce que ce test garde de plus que ses prédécesseurs : la migration choisit
 * les rôles par leur CONTENU (`b2b_orders:write`), jamais par leur clé — des
 * rôles se composent à l'écran, et une sélection par clé les oublierait
 * (objection BLOQUANTE de vitruve, 2026-09-25). On la rejoue donc sur un rôle
 * COMPOSÉ, que ni le contrat ni la migration ne nomment, et sur des écarts
 * individuels — pas seulement sur les rôles connus.
 *
 * Le guard résout depuis `ROLE_GRANTS`, pas depuis cette table (vérifié le
 * 2026-09-24, `storefront-roles-migration.e2e-spec.ts`) : ce test garde
 * l'accord table ↔ contrat et les écarts jumeaux ; l'ouverture des routes est
 * éprouvée par `counter-customers.e2e-spec.ts`.
 *
 * On REJOUE les ordres lus dans le fichier de migration, depuis l'état d'avant
 * — même mécanique, même raison que la suite vitrine.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ROLE_GRANTS, staffRoleSchema } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20260926100100_le_comptoir_est_accorde/migration.sql",
);

/** Un rôle composé à l'écran : il commande pour un pro sans être nommé nulle part. */
const COMPOSED = "vendeur_mixte";
/** Un rôle composé qui ne fait que LIRE les commandes : il ne gagne rien. */
const READER = "lecteur_commandes";

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

/** Les ordres de la migration — lus dans le fichier, jamais recopiés. */
function migrationStatements(): readonly string[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const statements = sql.match(/^(?:UPDATE|INSERT INTO) "public"\."staff_[a-z_]+"[^;]*;/gmu) ?? [];
  if (statements.length !== 4) {
    throw new Error(
      `Quatre ordres attendus dans la migration (deux UPDATE, deux INSERT), ${String(statements.length)} trouvés.`,
    );
  }
  return statements;
}

async function replayMigration(): Promise<void> {
  for (const statement of migrationStatements()) {
    await ctx.prisma.$executeRawUnsafe(statement);
  }
}

async function composedRole(key: string, grants: string): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `INSERT INTO "public"."staff_role_definitions" ("id", "key", "label", "grants", "updated_at")
     VALUES (gen_random_uuid()::text, $1, $1, $2::jsonb, CURRENT_TIMESTAMP)`,
    key,
    grants,
  );
}

/** Une personne et ses écarts ; rend l'id de sa fiche. */
async function staffWith(
  name: string,
  overrides: readonly { readonly action: "read" | "write"; readonly effect: "allow" | "deny" }[],
): Promise<string> {
  const user = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: name,
      email: `${name}@lfc.test`,
      role: "support",
      status: "active",
      auth0Id: `staff-${name}`,
    },
  });
  for (const override of overrides) {
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId: user.id, resource: "b2b_orders", ...override },
    });
  }
  return user.id;
}

/** La table telle qu'avant la migration, plus deux rôles composés à l'écran. */
async function beforeMigration(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(`
    UPDATE "public"."staff_role_definitions"
    SET "grants" = COALESCE(
      (SELECT jsonb_agg(entry) FROM jsonb_array_elements("grants") AS entry
       WHERE entry->>'resource' IS DISTINCT FROM 'b2b_counter'),
      '[]'::jsonb)`);
  await ctx.prisma.$executeRawUnsafe(
    `DELETE FROM "public"."staff_role_definitions" WHERE "key" = 'comptoir'`,
  );
  await composedRole(
    COMPOSED,
    '[{"resource":"b2b_orders","action":"write"},{"resource":"b2b_support","action":"read"}]',
  );
  await composedRole(READER, '[{"resource":"b2b_orders","action":"read"}]');
}

/** Les entrées `b2b_counter` de chaque rôle, telles que la table les porte. */
async function counterGrants(): Promise<Record<string, readonly string[]>> {
  const rows = await ctx.prisma.$queryRawUnsafe<{ key: string; actions: string[] }[]>(`
    SELECT "key",
           COALESCE(array_agg(entry->>'action') FILTER (WHERE entry->>'resource' = 'b2b_counter'), '{}') AS actions
    FROM "public"."staff_role_definitions"
    LEFT JOIN LATERAL jsonb_array_elements("grants") AS entry ON true
    GROUP BY "key"`);
  return Object.fromEntries(rows.map((row) => [row.key, row.actions]));
}

async function counterOverridesOf(staffUserId: string): Promise<readonly unknown[]> {
  return ctx.prisma.staffPermissionOverride.findMany({
    where: { staffUserId, resource: "b2b_counter" },
    select: { action: true, effect: true, grantedByStaffId: true },
  });
}

describe("la migration accorde `b2b_counter` — par le contenu, pas par la clé", () => {
  it("met la table d'accord avec le contrat, pour chaque rôle connu", async () => {
    await beforeMigration();
    // Le point de départ n'est pas vide par hasard : sans lui, le test
    // passerait même si la migration n'accordait rien.
    expect((await counterGrants())["commercial"]).toEqual([]);

    await replayMigration();

    const grants = await counterGrants();
    for (const role of staffRoleSchema.options) {
      const expected = ROLE_GRANTS[role].b2b_counter;
      expect({ role, actions: grants[role] ?? [] }).toEqual({
        role,
        actions: expected === undefined ? [] : [expected],
      });
    }
  });

  it("🔴 accorde la lecture à un rôle COMPOSÉ à l'écran qui commande, pas à celui qui lit", async () => {
    await beforeMigration();

    await replayMigration();

    const grants = await counterGrants();
    expect(grants[COMPOSED]).toEqual(["read"]);
    expect(grants[READER]).toEqual([]);
  });

  it("crée le rôle `comptoir` avec le Comptoir, la passation et la cloche, rien d'autre", async () => {
    await beforeMigration();

    await replayMigration();

    const role = await ctx.prisma.staffRoleDefinition.findUniqueOrThrow({
      where: { key: "comptoir" },
      select: { label: true, grants: true },
    });
    expect(role).toEqual({
      label: "Vendeur comptoir",
      grants: [
        { resource: "b2b_counter", action: "read" },
        { resource: "b2b_orders", action: "write" },
        { resource: "staff_notifications", action: "write" },
      ],
    });
  });

  it("🔴 pose un écart jumeau sur tout `allow b2b_orders:write`, sans auteur fabriqué", async () => {
    await beforeMigration();
    const allowed = await staffWith("autorise", [{ action: "write", effect: "allow" }]);
    const denied = await staffWith("refuse", [{ action: "write", effect: "deny" }]);
    const reader = await staffWith("lecteur", [{ action: "read", effect: "allow" }]);

    await replayMigration();

    expect(await counterOverridesOf(allowed)).toEqual([
      { action: "read", effect: "allow", grantedByStaffId: null },
    ]);
    expect(await counterOverridesOf(denied)).toEqual([]);
    expect(await counterOverridesOf(reader)).toEqual([]);
  });

  it("rejouée sur une base à jour, n'ajoute rien — un doublon jsonb passerait en silence", async () => {
    await beforeMigration();
    const allowed = await staffWith("autorise", [{ action: "write", effect: "allow" }]);

    await replayMigration();
    await replayMigration();

    const grants = await counterGrants();
    expect(grants["admin"]).toEqual(["write"]);
    expect(grants["commercial"]).toEqual(["read"]);
    expect(grants[COMPOSED]).toEqual(["read"]);
    expect(await counterOverridesOf(allowed)).toHaveLength(1);
    expect(await ctx.prisma.staffRoleDefinition.count({ where: { key: "comptoir" } })).toBe(1);
  });
});
