/**
 * E2E du **retrait de `b2b_catalog`** — lot L2 de
 * `documentation/droits-et-permissions/plan-droit-lfc-catalog.md` (C4 corrigé
 * par `vitruve`).
 *
 * Régressions visées, toutes deux nées de la première version du plan :
 * sortir la valeur du schéma faisait échouer la lecture d'un rôle ENTIER (ses
 * porteurs perdaient tous leurs droits) et tomber l'écran des rôles en 500.
 * La valeur reste donc lisible ; ce qui se prouve ici, sur la vraie base,
 * c'est qu'elle n'ouvre plus rien, ne fait rien perdre, et ne s'accorde plus.
 *
 * Les rôles qui la portent sont posés en base, comme la production les garde
 * — l'écran refuse désormais de les écrire.
 */
import type { StaffMeView, StaffRoleView, StaffUserView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const LEGACY_WRITE = { resource: "b2b_catalog", action: "write" } as const;
const ORDERS_READ = { resource: "b2b_orders", action: "read" } as const;

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

/** Un rôle tel que la production le garde, et une personne active qui le porte. */
async function holderOf(
  key: string,
  grants: readonly object[],
  overrides: readonly {
    resource: "b2b_catalog" | "lfc_catalog";
    action: "read" | "write";
    effect: "allow" | "deny";
  }[] = [],
): Promise<string> {
  await ctx.prisma.staffRoleDefinition.create({ data: { key, label: key, grants: [...grants] } });
  const created = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Léa",
      lastName: key,
      email: `${key}@lfc.test`,
      roleKey: key,
      role: null,
      status: "active",
      auth0Id: `sub-${key}`,
      overrides: { create: overrides.map((entry) => ({ ...entry })) },
    },
    select: { id: true },
  });
  return created.id;
}

async function permissionsOf(key: string): Promise<readonly string[]> {
  const response = await ctx.asSub(`sub-${key}`).get("/admin/me").expect(200);
  return jsonBody<StaffMeView>(response).permissions;
}

describe("un rôle qui porte encore b2b_catalog", () => {
  /** Régression : sortir la valeur du schéma vidait le rôle entier (vitruve, BLOQUANT). */
  it("garde tous ses AUTRES droits, et n'ouvre pas le catalogue", async () => {
    await holderOf("vente", [LEGACY_WRITE, ORDERS_READ]);

    const permissions = await permissionsOf("vente");
    expect(permissions).toContain("b2b_orders:read");
    expect(permissions.some((entry) => entry.includes("_catalog:"))).toBe(false);
    await ctx.asSub("sub-vente").get("/admin/catalog").expect(403);
  });

  /** Régression : un `parse` qui lève faisait tomber l'écran des rôles en 500 (vitruve, BLOQUANT). */
  it("se lit à l'écran des rôles, l'ancien droit montré sans rien résoudre", async () => {
    await holderOf("vente", [LEGACY_WRITE, ORDERS_READ]);

    const roles = jsonBody<readonly StaffRoleView[]>(
      await admin().get("/admin/staff-roles").expect(200),
    );
    const vente = roles.find((role) => role.key === "vente");
    expect(vente?.grants).toEqual([LEGACY_WRITE, ORDERS_READ]);
    expect(vente?.permissions).toEqual(["b2b_orders:read"]);
  });

  it("s'enregistre entier en gardant l'ancien droit tel quel, ou en le retirant", async () => {
    await holderOf("vente", [LEGACY_WRITE, ORDERS_READ]);

    await admin()
      .put("/admin/staff-roles/vente")
      .send({ label: "Vente", grants: [LEGACY_WRITE, ORDERS_READ] })
      .expect(204);
    await admin()
      .put("/admin/staff-roles/vente")
      .send({ label: "Vente", grants: [ORDERS_READ] })
      .expect(204);
  });

  it("refuse qu'on le lui accorde de nouveau, ou qu'on en change le niveau", async () => {
    await holderOf("vente", [{ resource: "b2b_catalog", action: "read" }, ORDERS_READ]);

    const raised = await admin()
      .put("/admin/staff-roles/vente")
      .send({ label: "Vente", grants: [LEGACY_WRITE, ORDERS_READ] })
      .expect(400);
    expect(jsonBody<{ code: string }>(raised).code).toBe("staff.resource_retired");
    await admin()
      .post("/admin/staff-roles")
      .send({ key: "neuf", label: "Neuf", grants: [LEGACY_WRITE] })
      .expect(400);
  });
});

describe("lfc_catalog garde les routes du catalogue", () => {
  it("ouvre la lecture du catalogue, et l'écriture reste fermée à la lecture seule", async () => {
    await holderOf("lecteur", [{ resource: "lfc_catalog", action: "read" }]);

    await ctx.asSub("sub-lecteur").get("/admin/catalog").expect(200);
    await ctx.asSub("sub-lecteur").put("/admin/catalog/VIE-001-1/featured").send({}).expect(403);
  });

  it("n'est pas refermé par un retrait encore posé sur b2b_catalog", async () => {
    await holderOf(
      "vendeur",
      [{ resource: "lfc_catalog", action: "write" }],
      [{ resource: "b2b_catalog", action: "read", effect: "deny" }],
    );

    expect(await permissionsOf("vendeur")).toEqual(["lfc_catalog:read", "lfc_catalog:write"]);
  });
});

describe("une fiche qui porte encore une dérogation b2b_catalog", () => {
  async function ficheOf(id: string): Promise<StaffUserView> {
    const response = await admin().get("/admin/staff-users").expect(200);
    const fiche = jsonBody<readonly StaffUserView[]>(response).find((entry) => entry.id === id);
    if (fiche === undefined) {
      throw new Error(`fiche ${id} absente de l'annuaire`);
    }
    return fiche;
  }

  function payloadOf(fiche: StaffUserView, overrides: StaffUserView["overrides"]): object {
    const { firstName, lastName, email, phone, jobTitle, role } = fiche;
    return { firstName, lastName, email, phone, jobTitle, role, overrides };
  }

  it("s'enregistre renvoyée entière, puis perd sa dérogation à l'écran", async () => {
    const id = await holderOf(
      "vente",
      [ORDERS_READ],
      [{ resource: "b2b_catalog", action: "write", effect: "allow" }],
    );
    const fiche = await ficheOf(id);
    expect(fiche.permissions).toEqual(["b2b_orders:read"]);

    await admin()
      .patch(`/admin/staff-users/${id}`)
      .send(payloadOf(fiche, fiche.overrides))
      .expect(204);
    await admin().patch(`/admin/staff-users/${id}`).send(payloadOf(fiche, [])).expect(204);
    expect((await ficheOf(id)).overrides).toEqual([]);
  });

  it("refuse une dérogation b2b_catalog nouvelle", async () => {
    const id = await holderOf("vente", [ORDERS_READ]);
    const fiche = await ficheOf(id);

    await admin()
      .patch(`/admin/staff-users/${id}`)
      .send(payloadOf(fiche, [{ resource: "b2b_catalog", action: "read", effect: "allow" }]))
      .expect(400);
  });
});
