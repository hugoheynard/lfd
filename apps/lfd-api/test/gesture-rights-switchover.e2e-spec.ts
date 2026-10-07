/**
 * E2E de **la bascule des droits par geste** —
 * `20261001130200_la_bascule_des_droits_par_geste`, rejouée
 * (`documentation/livraisons/droits/plan-droits-par-geste.md`, DG-D4 corrigé par
 * 5.1 bis et 5.3).
 *
 * Ce qu'elle doit tenir, et que ce test éprouve sur le vrai Postgres :
 *
 * - elle se calcule depuis l'ÉTAT de la base — un rôle créé à l'écran, que ni
 *   la graine ni la migration ne nomment, est couvert ;
 * - une source par ressource neuve : `b2b_orders` → plan, fiche, colisage,
 *   retrait au même niveau ; `b2b_orders:write` SEUL → `b2b_place_order:write` ;
 *   `b2b_companies` → `delivery_procedures` ; `delivery_loading` → rien ;
 * - les dérogations se recopient une pour une, `deny` compris ;
 * - rejouée, elle ne double rien.
 *
 * On REJOUE les ordres LUS dans le fichier de migration, depuis un état d'avant
 * fabriqué — même mécanique que les suites `*-roles-migration`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { roleGrantsSchema, type RoleGrant } from "@lfd/contracts";

import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20261001130200_la_bascule_des_droits_par_geste/migration.sql",
);

/** Les six ressources que la bascule distribue. */
const NEW_RESOURCES = [
  "b2b_place_order",
  "production_plan",
  "production_worksheet",
  "production_packing",
  "handover_counter",
  "delivery_procedures",
] as const;

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

/** Les ordres de la migration, lus dans le fichier — jamais recopiés. */
function migrationStatements(): readonly string[] {
  const sql = readFileSync(MIGRATION, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  const statements = sql
    .split(/;\s*(?:\n|$)/u)
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");
  if (statements.length !== 2) {
    throw new TypeError(
      `Deux ordres attendus (les rôles, les dérogations), ${String(statements.length)} lus.`,
    );
  }
  return statements;
}

async function replay(): Promise<void> {
  for (const statement of migrationStatements()) {
    await ctx.prisma.$executeRawUnsafe(statement);
  }
}

/** La table telle qu'avant la bascule : aucun rôle ne porte les six ressources. */
async function beforeSwitchover(): Promise<void> {
  const list = NEW_RESOURCES.map((resource) => `'${resource}'`).join(", ");
  await ctx.prisma.$executeRawUnsafe(`
    UPDATE "public"."staff_role_definitions"
    SET "grants" = COALESCE(
      (SELECT jsonb_agg(entry) FROM jsonb_array_elements("grants") AS entry
       WHERE NOT (entry->>'resource' = ANY (ARRAY[${list}]))),
      '[]'::jsonb)`);
}

async function screenRole(key: string, grants: readonly RoleGrant[]): Promise<void> {
  await ctx.prisma.staffRoleDefinition.create({ data: { key, label: key, grants: [...grants] } });
}

async function grantsOf(key: string): Promise<readonly RoleGrant[]> {
  const row = await ctx.prisma.staffRoleDefinition.findUniqueOrThrow({ where: { key } });
  return roleGrantsSchema.parse(row.grants);
}

function levelOf(grants: readonly RoleGrant[], resource: string): string | undefined {
  return grants.find((grant) => grant.resource === resource)?.action;
}

/** Une personne au rôle `support` et ses écarts ; rend l'id de sa fiche. */
async function staffWith(
  name: string,
  overrides: readonly {
    readonly resource: "b2b_orders" | "b2b_companies" | "delivery_loading";
    readonly action: "read" | "write";
    readonly effect: "allow" | "deny";
  }[],
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
      data: { staffUserId: user.id, ...override },
    });
  }
  return user.id;
}

async function overridesOf(staffUserId: string): Promise<readonly string[]> {
  const rows = await ctx.prisma.staffPermissionOverride.findMany({ where: { staffUserId } });
  return rows.map((row) => `${row.effect} ${row.resource}:${row.action}`).sort();
}

describe("la bascule des rôles — calculée depuis l'état de la base", () => {
  it("🔴 couvre un rôle CRÉÉ À L'ÉCRAN, au même niveau, une source par ressource", async () => {
    await beforeSwitchover();
    await screenRole("vendeur-marche", [
      { resource: "b2b_orders", action: "read" },
      { resource: "b2b_companies", action: "write" },
      { resource: "delivery_loading", action: "write" },
    ]);

    await replay();

    const grants = await grantsOf("vendeur-marche");
    expect(levelOf(grants, "production_plan")).toBe("read");
    expect(levelOf(grants, "production_worksheet")).toBe("read");
    expect(levelOf(grants, "production_packing")).toBe("read");
    expect(levelOf(grants, "handover_counter")).toBe("read");
    expect(levelOf(grants, "delivery_procedures")).toBe("write");
    // `b2b_orders:read` ne passe pas de commande ; `delivery_loading` n'est la
    // source de RIEN (5.3) — le colisage reste à la lecture.
    expect(levelOf(grants, "b2b_place_order")).toBeUndefined();
  });

  it("donne `b2b_place_order:write` à qui tenait `b2b_orders:write`, et à lui seul", async () => {
    await beforeSwitchover();

    await replay();

    for (const key of ["admin", "commercial", "comptabilite", "comptoir"]) {
      const grants = await grantsOf(key);
      expect({ key, level: levelOf(grants, "b2b_place_order") }).toEqual({ key, level: "write" });
      expect({ key, level: levelOf(grants, "production_packing") }).toEqual({
        key,
        level: "write",
      });
    }
    const support = await grantsOf("support");
    expect(levelOf(support, "b2b_place_order")).toBeUndefined();
    expect(levelOf(support, "handover_counter")).toBe("read");
    expect(levelOf(support, "delivery_procedures")).toBe("read");
    const communication = await grantsOf("communication");
    for (const resource of NEW_RESOURCES) {
      expect(levelOf(communication, resource)).toBeUndefined();
    }
  });

  it("n'écrase pas un niveau posé à l'écran entre les deux migrations", async () => {
    await beforeSwitchover();
    await ctx.prisma.$executeRawUnsafe(`
      UPDATE "public"."staff_role_definitions"
      SET "grants" = "grants" || '[{"resource":"production_packing","action":"read"}]'::jsonb
      WHERE "key" = 'comptabilite'`);

    await replay();

    const grants = await grantsOf("comptabilite");
    expect(grants.filter((grant) => grant.resource === "production_packing")).toEqual([
      { resource: "production_packing", action: "read" },
    ]);
  });

  it("rejouée, ne double rien — un doublon jsonb passerait en silence", async () => {
    await beforeSwitchover();
    await screenRole("vendeur-marche", [{ resource: "b2b_orders", action: "write" }]);

    await replay();
    const once = await grantsOf("vendeur-marche");
    await replay();

    expect(await grantsOf("vendeur-marche")).toEqual(once);
    expect(once.filter((grant) => grant.resource === "b2b_place_order")).toHaveLength(1);
  });
});

describe("la bascule des dérogations — une pour une", () => {
  it("🔴 recopie un `deny b2b_orders:write` sur chacune des cinq ressources qui le reprennent", async () => {
    await beforeSwitchover();
    const denied = await staffWith("refuse", [
      { resource: "b2b_orders", action: "write", effect: "deny" },
    ]);

    await replay();

    expect(await overridesOf(denied)).toEqual(
      [
        "deny b2b_orders:write",
        "deny b2b_place_order:write",
        "deny handover_counter:write",
        "deny production_packing:write",
        "deny production_plan:write",
        "deny production_worksheet:write",
      ].sort(),
    );
  });

  it("🔴 un `deny b2b_orders:read` retire aussi le droit de passer une commande", async () => {
    await beforeSwitchover();
    const denied = await staffWith("aveugle", [
      { resource: "b2b_orders", action: "read", effect: "deny" },
    ]);

    await replay();

    expect(await overridesOf(denied)).toContain("deny b2b_place_order:read");
  });

  it("recopie un `allow` au même niveau ; une lecture accordée ne donne pas la passation", async () => {
    await beforeSwitchover();
    const reader = await staffWith("lecteur", [
      { resource: "b2b_orders", action: "read", effect: "allow" },
      { resource: "b2b_companies", action: "read", effect: "allow" },
    ]);

    await replay();

    expect(await overridesOf(reader)).toEqual(
      [
        "allow b2b_companies:read",
        "allow b2b_orders:read",
        "allow delivery_procedures:read",
        "allow handover_counter:read",
        "allow production_packing:read",
        "allow production_plan:read",
        "allow production_worksheet:read",
      ].sort(),
    );
  });

  it("ne recopie rien depuis `delivery_loading` — aucune ressource neuve n'en hérite", async () => {
    await beforeSwitchover();
    const loader = await staffWith("chargeur", [
      { resource: "delivery_loading", action: "write", effect: "deny" },
    ]);

    await replay();

    expect(await overridesOf(loader)).toEqual(["deny delivery_loading:write"]);
  });

  it("rejouée, ne double aucune dérogation", async () => {
    await beforeSwitchover();
    const denied = await staffWith("refuse", [
      { resource: "b2b_orders", action: "write", effect: "deny" },
    ]);

    await replay();
    await replay();

    expect(await overridesOf(denied)).toHaveLength(6);
  });
});
