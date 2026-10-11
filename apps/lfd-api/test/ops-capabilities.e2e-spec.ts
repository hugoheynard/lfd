/**
 * E2E de la carte OPS **« Capacités »** — la route staff, à côté de celle au
 * jeton d'exploitation qui reste inchangée.
 *
 * Ce que seul ce niveau prouve : que la route est murée comme le reste d'OPS
 * (droit `ops_health` lu en base), et que le bulletin de démarrage traverse
 * jusqu'au corps sans qu'aucune valeur de réglage n'y entre.
 *
 * Le jeton porteur EST le `sub` : chaque rôle est une vraie fiche en base.
 */
import type { StaffRole } from "@lfd/contracts";
import type { CapabilitiesReport } from "@lfd/ops-contract";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { AppConfig } from "../src/platform/config/app-config.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const ROUTE = "/admin/ops/capabilities/staff";

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

describe("la carte des capacités", () => {
  it("refuse un appel anonyme (401)", async () => {
    expect((await ctx.http().get(ROUTE)).status).toBe(401);
  });

  it("refuse une personne sans le droit `ops_health` (403)", async () => {
    const commercial = await asRole("commercial");

    expect((await commercial.get(ROUTE)).status).toBe(403);
  });

  it("rend la révision et des capacités nommées, sans aucune valeur de réglage", async () => {
    const response = await ctx.asSub(E2E_STAFF_SUB).get(ROUTE);
    expect(response.status).toBe(200);
    const report = jsonBody<CapabilitiesReport>(response);
    const config = ctx.app.get(AppConfig);

    expect(report.revision).toBe(config.revision());
    for (const entry of report.missing) {
      expect(["blocking", "degraded"]).toContain(entry.severity);
      expect(entry.capability).not.toBe("");
      // Un réglage se nomme (« ROUTE_PLANNER_URL (https:// en production) » est
      // un libellé) ; une valeur fuitée aurait un hôte collé au schéma.
      expect(entry.setting).toMatch(/^(—|[A-Z][A-Z0-9_]+)/u);
      expect(entry.setting).not.toMatch(/:\/\/\S/u);
    }
    const body = JSON.stringify(report);
    const secrets = [config.databaseUrl(), config.recomputeToken()].filter(
      (value): value is string => value !== null && value !== "",
    );
    for (const secret of secrets) {
      expect(body).not.toContain(secret);
    }
  });
});
