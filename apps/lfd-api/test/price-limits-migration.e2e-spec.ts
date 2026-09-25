/**
 * E2E des **deux migrations des limites de prix**, sur le vrai Postgres
 * (`documentation/comptabilite/plan-limites-de-prix.md` §3, §5, §7).
 *
 * - `20260926130000_les_limites_ont_une_clientele` : une limite écrite sans
 *   clientèle — toutes celles d'avant — est `pro`, et deux pro qui se
 *   chevauchent restent refusées par la nouvelle contrainte ;
 * - `20260926130200_les_limites_de_prix_sont_accordees` : rejouée depuis
 *   l'état d'avant, elle met la table d'accord avec `ROLE_GRANTS` — admin et
 *   comptabilité en écriture, PERSONNE d'autre, pas même un rôle composé qui
 *   porte `b2b_pricing` (Hugo, 2026-09-25 : les commerciaux n'ont pas accès au
 *   bloc Comptabilité).
 *
 * Ces cas écrivent en SQL, et c'est leur sujet : ils éprouvent la base, pas
 * l'application — celle-ci l'est par `price-limits.e2e-spec.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ROLE_GRANTS, staffRoleSchema } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const GRANTS_MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20260926130200_les_limites_de_prix_sont_accordees/migration.sql",
);

/** Un rôle composé à l'écran qui price : il ne gagne RIEN. */
const PRICER = "tarifeur_compose";

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

/** Une limite globale écrite en SQL, sans clientèle si `clientele` est absente. */
async function insertGlobalFloor(id: string, clientele?: "pro" | "public"): Promise<void> {
  const column = clientele === undefined ? "" : `, "clientele"`;
  const value = clientele === undefined ? "" : `, '${clientele}'::"public"."OrderClientele"`;
  await ctx.prisma.$executeRawUnsafe(
    `INSERT INTO "public"."price_floors"
       ("id", "scope_type", "scope_id", "mode", "value", "created_by", "updated_at", "valid_from"${column})
     VALUES ($1, 'global', NULL, 'percent', 6000, 'e2e', CURRENT_TIMESTAMP, to_timestamp(0)${value})`,
    id,
  );
}

describe("la clientèle des limites", () => {
  it("rend `pro` une limite écrite sans clientèle — le sens réel de toutes celles d'avant", async () => {
    await insertGlobalFloor("flr_avant");

    const row = await ctx.prisma.priceFloor.findUniqueOrThrow({ where: { id: "flr_avant" } });
    expect(row.clientele).toBe("pro");
  });

  it("refuse toujours deux limites pro qui se chevauchent sur la même portée", async () => {
    await insertGlobalFloor("flr_1", "pro");

    await expect(insertGlobalFloor("flr_2", "pro")).rejects.toThrow(
      "price_floors_no_overlap_by_clientele",
    );
  });

  it("admet une pro et une publique sur la même portée, au même instant", async () => {
    await insertGlobalFloor("flr_pro", "pro");

    await insertGlobalFloor("flr_public", "public");

    expect(await ctx.prisma.priceFloor.count()).toBe(2);
  });

  it("n'a plus l'ancienne contrainte, qui les aurait confondues", async () => {
    const rows = await ctx.prisma.$queryRawUnsafe<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint WHERE conname LIKE 'price_floors_no_overlap%'`,
    );

    expect(rows.map((row) => row.conname)).toEqual(["price_floors_no_overlap_by_clientele"]);
  });
});

/** Les ordres de la migration — lus dans le fichier, jamais recopiés. */
function grantStatements(): readonly string[] {
  const sql = readFileSync(GRANTS_MIGRATION, "utf8");
  const statements = sql.match(/^UPDATE "public"\."staff_[a-z_]+"[^;]*;/gmu) ?? [];
  if (statements.length !== 2) {
    throw new Error(
      `Deux ordres attendus dans la migration (admin, comptabilite), ${String(statements.length)} trouvés.`,
    );
  }
  return statements;
}

async function replayGrants(): Promise<void> {
  for (const statement of grantStatements()) {
    await ctx.prisma.$executeRawUnsafe(statement);
  }
}

/** La table telle qu'avant la migration, plus un rôle composé qui price. */
async function beforeGrants(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(`
    UPDATE "public"."staff_role_definitions"
    SET "grants" = COALESCE(
      (SELECT jsonb_agg(entry) FROM jsonb_array_elements("grants") AS entry
       WHERE entry->>'resource' IS DISTINCT FROM 'price_limits'),
      '[]'::jsonb)`);
  await ctx.prisma.$executeRawUnsafe(
    `INSERT INTO "public"."staff_role_definitions" ("id", "key", "label", "grants", "updated_at")
     VALUES (gen_random_uuid()::text, $1, $1, $2::jsonb, CURRENT_TIMESTAMP)`,
    PRICER,
    '[{"resource":"b2b_pricing","action":"write"}]',
  );
}

/** Les entrées `price_limits` de chaque rôle, telles que la table les porte. */
async function limitGrants(): Promise<Record<string, readonly string[]>> {
  const rows = await ctx.prisma.$queryRawUnsafe<{ key: string; actions: string[] }[]>(`
    SELECT "key",
           COALESCE(array_agg(entry->>'action') FILTER (WHERE entry->>'resource' = 'price_limits'), '{}') AS actions
    FROM "public"."staff_role_definitions"
    LEFT JOIN LATERAL jsonb_array_elements("grants") AS entry ON true
    GROUP BY "key"`);
  return Object.fromEntries(rows.map((row) => [row.key, row.actions]));
}

describe("la migration accorde `price_limits` — à l'administrateur et à la comptabilité seuls", () => {
  it("met la table d'accord avec le contrat, pour chaque rôle connu", async () => {
    await beforeGrants();
    // Sans ce point de départ, le test passerait même si la migration n'accordait rien.
    expect((await limitGrants())["comptabilite"]).toEqual([]);

    await replayGrants();

    const grants = await limitGrants();
    for (const role of staffRoleSchema.options) {
      const expected = ROLE_GRANTS[role].price_limits;
      expect({ role, actions: grants[role] ?? [] }).toEqual({
        role,
        actions: expected === undefined ? [] : [expected],
      });
    }
  });

  it("🔴 n'accorde rien à un rôle composé qui price, ni au commercial", async () => {
    await beforeGrants();

    await replayGrants();

    const grants = await limitGrants();
    expect(grants[PRICER]).toEqual([]);
    expect(grants["commercial"]).toEqual([]);
  });

  it("rejouée sur une base à jour, n'ajoute rien — un doublon jsonb passerait en silence", async () => {
    await beforeGrants();

    await replayGrants();
    await replayGrants();

    const grants = await limitGrants();
    expect(grants["admin"]).toEqual(["write"]);
    expect(grants["comptabilite"]).toEqual(["write"]);
  });

  it("n'écrase pas un niveau déjà posé à l'écran", async () => {
    await beforeGrants();
    await ctx.prisma.$executeRawUnsafe(`
      UPDATE "public"."staff_role_definitions"
      SET "grants" = "grants" || '[{"resource":"price_limits","action":"read"}]'::jsonb
      WHERE "key" = 'comptabilite'`);

    await replayGrants();

    expect((await limitGrants())["comptabilite"]).toEqual(["read"]);
  });
});
