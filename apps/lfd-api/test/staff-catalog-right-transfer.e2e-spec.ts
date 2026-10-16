/**
 * E2E de **l'aperçu du transfert `b2b_catalog` → `lfc_catalog`** —
 * `documentation/droits-et-permissions/plan-droit-lfc-catalog.md`, lot L1 (C2
 * corrigé par `vitruve`).
 *
 * Ce que seule la vraie base dit : que les droits relus du `jsonb` des rôles
 * et les lignes de dérogation typées par l'enum (qui reçoit `lfc_catalog` par
 * la migration du lot) s'assemblent ; que le mur `staff_access` est posé ; et
 * que le geste du runbook — accorder à l'écran, puis retirer l'ancien — mène
 * l'aperçu à « sans écart ».
 *
 * Depuis le lot L2 (2026-10-16), `b2b_catalog` ne s'accorde plus et la graine
 * ne le sème plus : un rôle qui le porte encore — l'état de la production
 * avant le geste de Hugo — se pose ici en base, comme il y est.
 */
import {
  catalogRightTransferViewSchema,
  staffRoleSchema,
  type CatalogRightTransferView,
  type StaffRoleView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const ROUTE = "/admin/staff-access/catalog-right-transfer";

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

const admin = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

type CatalogOverride = {
  readonly resource: "b2b_catalog" | "lfc_catalog";
  readonly action: "read" | "write";
  readonly effect: "allow" | "deny";
};

/** Une personne active qui porte `roleKey`, avec ses dérogations. */
async function person(
  sub: string,
  roleKey: string,
  overrides: readonly CatalogOverride[] = [],
): Promise<void> {
  const builtIn = staffRoleSchema.safeParse(roleKey);
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Léa",
      lastName: sub,
      email: `${sub}@lfc.test`,
      roleKey,
      role: builtIn.success ? builtIn.data : null,
      status: "active",
      auth0Id: sub,
      overrides: { create: overrides.map((entry) => ({ ...entry })) },
    },
  });
}

/** Un rôle tel que la production le garde : ses droits écrits avant L2. */
async function storedRole(key: string, grants: readonly object[]): Promise<void> {
  await ctx.prisma.staffRoleDefinition.create({ data: { key, label: key, grants: [...grants] } });
}

async function seedNotification(id: string, audience: string, read: boolean): Promise<void> {
  await ctx.prisma.staffNotification.create({
    data: {
      id,
      kind: "catalog.arrival",
      subject: "Arrivée au catalogue",
      body: "Une ligne",
      link: "/b2b/catalogue",
      idempotencyKey: `notification:${id}`,
      occurredAt: new Date(daysAgo(3)),
      audience,
      readAt: read ? new Date(daysAgo(2)) : null,
      readBy: read ? "fiche-quelconque" : null,
    },
  });
}

async function preview(): Promise<CatalogRightTransferView> {
  const response = await admin().get(ROUTE).expect(200);
  return catalogRightTransferViewSchema.parse(jsonBody<unknown>(response));
}

describe("GET /admin/staff-access/catalog-right-transfer", () => {
  it("est muré par staff_access : le commercial ne le lit pas", async () => {
    await person("commerciale", "commercial");
    await ctx.asSub("commerciale").get(ROUTE).expect(403);
  });

  it("ne voit plus b2b_catalog dans la graine : elle ne le sème plus depuis L2", async () => {
    const view = await preview();
    expect(view.roles.every((line) => line.legacyLevel === null && line.gap === "none")).toBe(true);
    expect(view.clear).toBe(true);
  });

  it("montre un rôle encore porteur de b2b_catalog, recopié au même niveau", async () => {
    await storedRole("vente", [
      { resource: "b2b_catalog", action: "write" },
      { resource: "lfc_catalog", action: "write" },
    ]);
    const line = (await preview()).roles.find((candidate) => candidate.key === "vente");
    expect(line).toMatchObject({ legacyLevel: "write", catalogLevel: "write" });
    expect(line?.gap).toBe("legacy_still_held");
  });

  it("nomme le retrait non recopié d'une dérogation", async () => {
    await person("lea", "commercial", [
      { resource: "b2b_catalog", action: "write", effect: "deny" },
    ]);
    const view = await preview();
    expect(view.overrides).toEqual([
      expect.objectContaining({
        staffName: "Léa lea",
        action: "write",
        legacyEffect: "deny",
        catalogEffect: null,
        gap: "revoke_not_copied",
      }),
    ]);
  });

  it("compte les seules notifications non lues d'audience b2b_catalog:*", async () => {
    await seedNotification("n-1", "b2b_catalog:write", false);
    await seedNotification("n-2", "b2b_catalog:read", false);
    await seedNotification("n-3", "b2b_catalog:write", true);
    await seedNotification("n-4", "b2b_orders:write", false);
    expect((await preview()).unreadLegacyNotifications).toBe(2);
  });

  it("atteint « sans écart » par le geste du runbook : accorder lfc_catalog, puis retirer b2b_catalog", async () => {
    // Un rôle défini avant L2 qui ne tient que l'ancien droit : il a perdu l'accès.
    await storedRole("vitrine", [{ resource: "b2b_catalog", action: "read" }]);
    expect((await preview()).roles.find((line) => line.key === "vitrine")?.gap).toBe(
      "catalog_missing",
    );

    const roles = jsonBody<readonly StaffRoleView[]>(
      await admin().get("/admin/staff-roles").expect(200),
    );
    for (const role of roles.filter((candidate) => !candidate.locked)) {
      const legacy = role.grants.find((grant) => grant.resource === "b2b_catalog");
      if (legacy === undefined) {
        continue;
      }
      const kept = role.grants.filter(
        (grant) => grant.resource !== "b2b_catalog" && grant.resource !== "lfc_catalog",
      );
      await admin()
        .put(`/admin/staff-roles/${role.key}`)
        .send({
          label: role.label,
          grants: [...kept, { resource: "lfc_catalog", action: legacy.action }],
        })
        .expect(204);
    }

    const view = await preview();
    expect(view.roles.every((line) => line.gap === "none")).toBe(true);
    expect(view.roles.find((line) => line.key === "vitrine")).toMatchObject({
      legacyLevel: null,
      catalogLevel: "read",
    });
    expect(view.clear).toBe(true);
  });
});
