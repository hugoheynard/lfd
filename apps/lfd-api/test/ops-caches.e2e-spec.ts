/**
 * E2E de l'onglet **Cache** de la santé (`documentation/caching-usage/
 * plan-onglet-cache.md`) — `GET /admin/ops/caches`.
 *
 * Ce que seul ce niveau prouve : que la route est murée comme le reste d'OPS
 * (droit `ops_health` lu en base), et que, sans objet partagé (e2e : aucune
 * adresse posée), elle le DIT par objet plutôt que de rendre des zéros.
 *
 * Le jeton porteur EST le `sub` : chaque rôle est une vraie fiche en base.
 */
import type { StaffRole } from "@lfd/contracts";
import type { CacheMetricsReport } from "@lfd/ops-contract";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const ROUTE = "/admin/ops/caches";

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

describe("l'onglet Cache de la santé", () => {
  it("refuse un appel anonyme (401)", async () => {
    expect((await ctx.http().get(ROUTE)).status).toBe(401);
  });

  it("refuse une personne sans le droit `ops_health` (403)", async () => {
    const commercial = await asRole("commercial");

    expect((await commercial.get(ROUTE)).status).toBe(403);
  });

  it("borne la période, et dit que les objets ne sont pas configurés", async () => {
    const response = await ctx.asSub(E2E_STAFF_SUB).get(`${ROUTE}?days=90`);
    expect(response.status).toBe(200);
    const report = jsonBody<CacheMetricsReport>(response);

    expect(report.days).toBe(30);
    expect(report.caches).toEqual([]);
    expect(report.objects.map((one) => [one.object, one.state])).toEqual([
      ["day-versions", "not-configured"],
      ["pro-shelves", "not-configured"],
    ]);
    expect(report.instance.fallbacks.map((one) => one.store)).toEqual([
      "shelf_cache",
      "day_versions",
      "versioned_contents",
    ]);
  });
});
