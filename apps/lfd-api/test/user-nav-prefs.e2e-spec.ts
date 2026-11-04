/**
 * E2E des **préférences de navigation hors de `users`** —
 * `documentation/caching-usage/plan-principal-en-memoire.md`, §3 ter.
 *
 * La migration est appliquée par le harnais ; on rejoue ici son seul bloc de
 * copie, lu entre ses deux marqueurs, sur des `users` dont la colonne morte
 * porte chacune des formes rencontrées. Puis on vérifie la raison du
 * déménagement : écrire une préférence ne fait plus monter l'estampille.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20261104120000_l_estampille_du_principal/migration.sql",
);

/** Le bloc de copie de la migration, tel qu'il est écrit entre ses marqueurs. */
function copyBlock(): string {
  const sql = readFileSync(MIGRATION, "utf8");
  const match = /-- >>> user_nav_prefs copy\n([\s\S]*?)-- <<< user_nav_prefs copy/.exec(sql);
  if (match?.[1] === undefined) {
    throw new Error("Le bloc de copie de user_nav_prefs est introuvable dans la migration.");
  }
  return match[1];
}

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

async function seedLegacy(sub: string, navPrefs: string | null): Promise<string> {
  const user = await createUser(ctx.prisma, { auth0Sub: sub });
  await ctx.prisma.$executeRaw`
    UPDATE "public"."users" SET "nav_prefs" = ${navPrefs}::jsonb WHERE "id" = ${user.id}`;
  return user.id;
}

describe("la copie de users.nav_prefs vers user_nav_prefs", () => {
  it("ne copie que les objets — 'null', un tableau et NULL ne sont pas des préférences", async () => {
    const object = await seedLegacy("auth0|object", '{"catalogueView":"list"}');
    await seedLegacy("auth0|json-null", "null");
    await seedLegacy("auth0|array", '["list"]');
    await seedLegacy("auth0|sql-null", null);

    await ctx.prisma.$executeRawUnsafe(copyBlock());

    const rows = await ctx.prisma.userNavPrefs.findMany();
    expect(rows.map((row) => ({ userId: row.userId, prefs: row.prefs }))).toEqual([
      { userId: object, prefs: { catalogueView: "list" } },
    ]);
  });
});

describe("PATCH /me/nav-prefs — hors du principal", () => {
  async function stamp(): Promise<bigint> {
    const row = await ctx.prisma.principalStamp.findUniqueOrThrow({ where: { id: 1 } });
    return row.value;
  }

  it("ne fait pas monter l'estampille : un changement d'espace ne vide pas la mémoire des principaux", async () => {
    const sub = "auth0|prefs";
    await createUser(ctx.prisma, { auth0Sub: sub });
    // La première entrée écrit `first_login_at` : elle se fait avant la mesure.
    await ctx.asSub(sub).get("/me").expect(200);
    const before = await stamp();

    await ctx.asSub(sub).patch("/me/nav-prefs").send({ catalogueView: "list" }).expect(200);
    await ctx.asSub(sub).patch("/me/nav-prefs").send({ catalogueView: "shelves" }).expect(200);

    expect(await stamp()).toBe(before);
    const row = await ctx.prisma.userNavPrefs.findFirstOrThrow();
    expect(row.prefs).toEqual({ catalogueView: "shelves" });
  });
});
