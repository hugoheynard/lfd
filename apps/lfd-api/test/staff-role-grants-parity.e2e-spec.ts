/**
 * E2E de la **parité table ↔ contrat, depuis la graine** — le trou que l'état
 * des lieux de la production a trouvé le 2026-09-25
 * (`documentation/staff/plan-roles-lus-en-base.md` §6).
 *
 * `b2b_accounting`, `b2b_order_waivers` et `b2b_feature_access` n'avaient été
 * écrites par AUCUNE migration : elles n'existaient que dans `ROLE_GRANTS`. Le
 * harnais ne pouvait pas le voir — il re-sème les définitions depuis le contrat
 * à chaque remise à zéro. Ce test fait l'inverse : il repart de la graine de
 * `20260901140000_roles_definis` et rejoue, dans l'ordre, TOUS les ordres de
 * migration qui écrivent `staff_role_definitions`. Chaque définition semée doit
 * alors dire exactement ce que dit `ROLE_GRANTS` : c'est ce que le résolveur lit
 * depuis la bascule.
 *
 * Il échoue sans `20260926120100_les_droits_jamais_ecrits` (vérifié le 2026-09-26).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { legacyRoleSeeds, type RoleGrant } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const MIGRATIONS = join(process.cwd(), "prisma/migrations");
/** La migration qui a créé la table : le point de départ, graine comprise. */
const SEED_MIGRATION = "20260901140000_roles_definis";

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

/** Les ordres qui écrivent la table, migration par migration, dans l'ordre d'application. */
function definitionWrites(): readonly string[] {
  const pattern = /^(?:INSERT INTO|UPDATE|DELETE FROM) "public"\."staff_role_definitions"[^;]*;/gmu;
  return readdirSync(MIGRATIONS)
    .filter((name) => name >= SEED_MIGRATION && !name.endsWith(".toml"))
    .sort()
    .flatMap(
      (name) => readFileSync(join(MIGRATIONS, name, "migration.sql"), "utf8").match(pattern) ?? [],
    );
}

/** Une forme comparable d'un jeu de droits, indépendante de l'ordre. */
function normalized(grants: readonly RoleGrant[]): readonly string[] {
  return grants.map((grant) => `${grant.resource}:${grant.action}`).sort();
}

describe("les définitions semées par les migrations égalent ROLE_GRANTS", () => {
  it("rejouées depuis la graine du 2026-09-01, chaque rôle du contrat a exactement ses droits", async () => {
    // L'état d'avant la graine : aucune fiche (la clé étrangère `role_key` les
    // rattache aux définitions), aucune définition.
    await ctx.prisma.staffUser.deleteMany();
    await ctx.prisma.staffRoleDefinition.deleteMany();
    const writes = definitionWrites();
    expect(writes.length).toBeGreaterThan(5);

    for (const statement of writes) {
      await ctx.prisma.$executeRawUnsafe(statement);
    }

    const rows = await ctx.prisma.staffRoleDefinition.findMany();
    const byKey = new Map(rows.map((row) => [row.key, row.grants]));
    for (const seed of legacyRoleSeeds()) {
      const stored = byKey.get(seed.key) as readonly RoleGrant[] | undefined;
      expect({ key: seed.key, grants: normalized(stored ?? []) }).toEqual({
        key: seed.key,
        grants: normalized(seed.grants),
      });
    }
  });
});
