/**
 * E2E de **la graine des rôles** — ce qu'une base vierge reçoit
 * (`documentation/livraisons/droits/plan-droits-par-geste.md`, DG-D5).
 *
 * Remplace la parité `staff-role-grants-parity` (retirée le 2026-10-01). Elle
 * rejouait toutes les migrations qui écrivent `staff_role_definitions` et
 * exigeait que la base égale `ROLE_GRANTS` : c'était tenir le code pour le
 * miroir de la production, donc obliger chaque ressource neuve à arriver avec
 * une migration qui l'accorde. Depuis la bascule des droits par geste, qui a
 * quel droit se règle à l'écran ; `ROLE_GRANTS` n'est plus qu'une graine.
 *
 * Ce qui reste à garder : une base semée a exactement les rôles de la graine,
 * avec exactement leurs droits — c'est sur elle que tournent le dev et les
 * e2e. La validité de la graine elle-même (ressources connues, pas de
 * doublon) est tenue par `packages/contracts/src/__tests__/staff-role.spec.ts`.
 */
import { legacyRoleSeeds, roleGrantsSchema, type RoleGrant } from "@lfd/contracts";

import { resetRolesToSeed } from "../src/dev/seeding/roles.seed.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Une forme comparable d'un jeu de droits, indépendante de l'ordre. */
function normalized(grants: readonly RoleGrant[]): readonly string[] {
  return grants.map((grant) => `${grant.resource}:${grant.action}`).sort();
}

describe("une base semée", () => {
  it("a exactement les rôles de la graine, et aucun autre", async () => {
    const rows = await ctx.prisma.staffRoleDefinition.findMany({ select: { key: true } });

    expect(rows.map((row) => row.key).sort()).toEqual(
      legacyRoleSeeds()
        .map((seed) => seed.key)
        .sort(),
    );
  });

  it("donne à chacun exactement les droits de la graine, lisibles par le résolveur", async () => {
    const rows = await ctx.prisma.staffRoleDefinition.findMany();
    const byKey = new Map(rows.map((row) => [row.key, row]));

    for (const seed of legacyRoleSeeds()) {
      const row = byKey.get(seed.key);
      const parsed = roleGrantsSchema.safeParse(row?.grants);
      expect({ key: seed.key, readable: parsed.success }).toEqual({
        key: seed.key,
        readable: true,
      });
      expect({ key: seed.key, label: row?.label, grants: normalized(parsed.data ?? []) }).toEqual({
        key: seed.key,
        label: seed.label,
        grants: normalized(seed.grants),
      });
    }
  });
});

/**
 * `db:seed:roles` (audit livraisons Q4, 2026-10-07) : la commande qu'on lance
 * à la main sur une base de dev après l'ajout d'une ressource. La même
 * fonction que le harnais, sur une base qui a vécu.
 */
describe("la remise des rôles sur leur graine", () => {
  it("réécrit un rôle du code réglé à l'écran, recrée celui qui manque, et laisse un rôle créé à l'écran", async () => {
    const [first, second] = legacyRoleSeeds();
    if (first === undefined || second === undefined) {
      throw new Error("La graine porte au moins deux rôles.");
    }
    await ctx.prisma.staffRoleDefinition.update({
      where: { key: first.key },
      data: { label: "Réglé à l'écran", grants: [] },
    });
    await ctx.prisma.staffRoleDefinition.delete({ where: { key: second.key } });
    await ctx.prisma.staffRoleDefinition.create({
      data: { key: "verifier_maison", label: "Vérificateur", grants: [] },
    });

    const report = await resetRolesToSeed(ctx.prisma);

    expect(report.created).toEqual([second.key]);
    expect(report.rewritten).toContain(first.key);
    expect(report.untouched).toEqual(["verifier_maison"]);
    const rewritten = await ctx.prisma.staffRoleDefinition.findUniqueOrThrow({
      where: { key: first.key },
    });
    expect(rewritten.label).toBe(first.label);
    expect(normalized(roleGrantsSchema.parse(rewritten.grants))).toEqual(normalized(first.grants));
    const custom = await ctx.prisma.staffRoleDefinition.findUnique({
      where: { key: "verifier_maison" },
    });
    expect(custom?.label).toBe("Vérificateur");
  });
});
