/**
 * E2E de la migration `20260926120000_les_roles_se_lisent_en_base`, rejouée
 * (plan `documentation/staff/plan-roles-lus-en-base.md` §3.1 et §5).
 *
 * Même mécanique que les suites `*-roles-migration` : on REJOUE les ordres lus
 * dans le fichier de migration, depuis un état d'avant fabriqué — jamais une
 * copie de ces ordres.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { legacyRoleSeeds } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20260926120000_les_roles_se_lisent_en_base/migration.sql",
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

/** Un ordre de la migration, lu dans le fichier. */
function statement(pattern: RegExp): string {
  const found = readFileSync(MIGRATION, "utf8").match(pattern)?.[0];
  if (found === undefined) {
    throw new Error(`Ordre introuvable dans la migration : ${String(pattern)}`);
  }
  return found;
}

const SEED_DEFINITIONS = /^INSERT INTO "public"\."staff_role_definitions"[^;]*;/mu;
const BACKFILL_KEYS = /^UPDATE "public"\."staff_users" SET "role_key"[^;]*;/mu;

describe("la migration des clés de rôle", () => {
  it("crée depuis le contrat une définition manquante, sans toucher les autres", async () => {
    // Personne ne porte `dev` après une remise à zéro : sa ligne peut partir.
    await ctx.prisma.staffRoleDefinition.delete({ where: { key: "dev" } });
    await ctx.prisma.staffRoleDefinition.update({
      where: { key: "support" },
      data: { label: "Support édité à l'écran" },
    });

    await ctx.prisma.$executeRawUnsafe(statement(SEED_DEFINITIONS));

    const dev = await ctx.prisma.staffRoleDefinition.findUniqueOrThrow({ where: { key: "dev" } });
    const expected = legacyRoleSeeds().find((seed) => seed.key === "dev");
    expect(dev).toMatchObject({ label: expected?.label, grants: expected?.grants });
    // `DO NOTHING` : une édition faite à l'écran reste une décision.
    const support = await ctx.prisma.staffRoleDefinition.findUniqueOrThrow({
      where: { key: "support" },
    });
    expect(support.label).toBe("Support édité à l'écran");
  });

  it("sème une définition pour CHAQUE valeur de l'enum", () => {
    const sql = statement(SEED_DEFINITIONS);

    for (const seed of legacyRoleSeeds()) {
      expect(sql).toContain(`('${seed.key}', `);
    }
  });

  it("remplit la clé depuis l'enum : chaque fiche a sa `role_key` égale à son `role`", async () => {
    await ctx.prisma.staffUser.create({
      data: { firstName: "A", lastName: "B", email: "a@lfc.test", role: "comptoir" },
    });
    // L'état d'avant : la colonne vient d'être ajoutée, vide. Le déclencheur ne
    // réagit qu'à une écriture de `role`, pas à celle-ci.
    await ctx.prisma.$executeRaw`UPDATE "public"."staff_users" SET "role_key" = NULL`;

    await ctx.prisma.$executeRawUnsafe(statement(BACKFILL_KEYS));

    const rows = await ctx.prisma.staffUser.findMany({ select: { role: true, roleKey: true } });
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((row) => row.role !== null && row.roleKey === row.role)).toBe(true);
  });
});
