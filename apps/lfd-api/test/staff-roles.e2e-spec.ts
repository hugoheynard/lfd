/**
 * E2E de **la matrice des rôles** : les cinq rôles, sur toutes les surfaces, en
 * vrai HTTP.
 *
 * La suite `staff-access` prouve que le mur existe ; celle-ci prouve qu'il est
 * posé **au bon endroit pour chacun**. Ce sont deux choses différentes : un
 * guard parfait sur un mappage faux ouvre une porte au mauvais métier, et rien
 * dans le code ne s'en aperçoit — c'est le risque nommé « élevé » dans le plan.
 *
 * Les attentes sont **dérivées de `ROLE_GRANTS`**, jamais recopiées. Un rôle
 * ajouté, une permission retirée, et ce fichier suit tout seul : sinon la
 * matrice du contrat et celle du test divergeraient, et c'est la seconde qu'on
 * croirait.
 *
 * Modèle : `documentation/b2b/architecture-acces-staff.md` §4 et §5.
 */
import {
  hasStaffPermission,
  resolveStaffPermissions,
  staffPermission,
  staffRoleSchema,
  type StaffResource,
  type StaffRole,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/**
 * Une surface **en lecture** par ressource gardée.
 *
 * `me` en est absente : elle est réflexive et répond à tout le monde, la suite
 * `staff-access` s'en charge. `tech` aussi : aucune route ne la porte encore —
 * et l'inventer ici ferait passer un test sur une porte qui n'existe pas.
 */
const SURFACES: readonly { readonly resource: StaffResource; readonly path: string }[] = [
  { resource: "companies", path: "/admin/companies" },
  { resource: "orders", path: "/admin/orders" },
  { resource: "growth", path: "/admin/cockpit" },
  { resource: "appointments", path: "/admin/appointments?from=2026-08-01&to=2026-08-31" },
  { resource: "support", path: "/admin/support-requests" },
  { resource: "settings", path: "/admin/order-cutoffs" },
  { resource: "staff", path: "/admin/staff-users" },
];

/** Le produit cartésien rôle × surface : tout ce qu'il y a à vérifier. */
const CASES = staffRoleSchema.options.flatMap((role) =>
  SURFACES.map(({ resource, path }) => ({
    role,
    resource,
    path,
    // La vérité vient du contrat, pas d'une table recopiée à la main.
    allowed: hasStaffPermission(
      resolveStaffPermissions(role, []),
      staffPermission(resource, "read"),
    ),
  })),
);

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

/** Sème une personne de ce rôle, déjà entrée, et rend son agent HTTP. */
async function asRole(role: StaffRole): Promise<ReturnType<E2eContext["asSub"]>> {
  const sub = `staff-${role}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: role,
      email: `${role}@lfc.test`,
      role,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

describe("la matrice des rôles, éprouvée route par route", () => {
  it.each(CASES.filter((entry) => entry.allowed))("$role LIT $resource", async ({ role, path }) => {
    const agent = await asRole(role);

    await agent.get(path).expect(200);
  });

  it.each(CASES.filter((entry) => !entry.allowed))(
    "$role se voit REFUSER $resource",
    async ({ role, path }) => {
      const agent = await asRole(role);

      const response = await agent.get(path);

      // 403, jamais 404 : une route mal orthographiée rendrait ce test vert
      // sans rien prouver.
      expect(response.status).toBe(403);
    },
  );
});

describe("la matrice des rôles — l'écriture se déduit du verbe", () => {
  /**
   * Le cas qui compte : une ressource qu'un rôle **lit** sans pouvoir
   * l'**écrire**. C'est là que le guard travaille vraiment — la même route, le
   * même périmètre, et seule l'intention du verbe les sépare.
   */
  it("laisse le commercial lire les réglages mais pas les écrire", async () => {
    const agent = await asRole("commercial");

    await agent.get("/admin/order-cutoffs").expect(200);

    const response = await agent.patch("/admin/order-cutoffs/inexistant").send({});
    expect(response.status).toBe(403);
  });

  it("laisse l'administrateur écrire là où le commercial ne peut que lire", async () => {
    // Le pendant : sans lui, un `403` universel sur cette route passerait le
    // test précédent pour la mauvaise raison.
    const agent = await asRole("admin");

    const response = await agent.patch("/admin/order-cutoffs/inexistant").send({});
    expect(response.status).not.toBe(403);
  });
});

describe("la matrice des rôles — la couverture est complète", () => {
  it("éprouve les cinq rôles du catalogue", () => {
    // Un rôle ajouté au contrat sans surface éprouvée passerait inaperçu : ce
    // test échoue tant qu'il n'apparaît pas dans les cas ci-dessus.
    const covered = new Set(CASES.map((entry) => entry.role));

    expect([...covered].sort()).toEqual([...staffRoleSchema.options].sort());
  });

  it("éprouve, pour chaque rôle, au moins une ouverture", () => {
    // Un rôle qui ne verrait que des refus ne prouverait pas qu'il opère : on
    // aurait mesuré un mur, pas un périmètre.
    for (const role of staffRoleSchema.options) {
      const mine = CASES.filter((entry) => entry.role === role);

      expect(mine.some((entry) => entry.allowed)).toBe(true);
    }
  });

  it("éprouve au moins un refus pour chaque rôle SAUF l'administrateur", () => {
    // `admin` n'a aucun refus, et c'est le modèle qui le veut : il a tout.
    // L'exiger de lui aussi aurait fait échouer un test pour une vérité — la
    // pire façon de perdre confiance dans une suite.
    for (const role of staffRoleSchema.options.filter((entry) => entry !== "admin")) {
      const mine = CASES.filter((entry) => entry.role === role);

      expect(mine.some((entry) => !entry.allowed)).toBe(true);
    }

    // Et on fige le fait lui-même : le jour où `admin` perd une ressource, c'est
    // une décision, pas un accident — ce test doit alors être relu.
    const adminRefusals = CASES.filter((entry) => entry.role === "admin" && !entry.allowed);
    expect(adminRefusals).toEqual([]);
  });
});
