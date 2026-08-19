/**
 * E2E de la **lecture staff des paniers récurrents** d'un compte.
 *
 * Ce que seul le vrai SQL prouve : qu'un abonnement, qui n'a **aucune colonne
 * société**, se rattache bien au compte par la jointure `memberships` — donc que
 * la liste rend les paniers de **tous** les membres, nomme leur porteur, et ne
 * laisse pas entrer celui d'un client qui n'appartient pas au compte.
 *
 * Frontière doublée : la signature du jeton staff. Le reste est réel.
 */
import type { AdminSubscriptionRow } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const MEMBER = "auth0|member";
const COLLEAGUE = "auth0|colleague";
const OUTSIDER = "auth0|outsider";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
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

function weeklyPickup(sku: string): Record<string, unknown> {
  return {
    fromOrderId: null,
    recurrence: "weekly",
    startDate: "2026-08-10",
    endDate: null,
    fulfillmentMethod: "pickup",
    deliveryAddress: null,
    pickupAddressId: null,
    lines: [{ sku, quantity: 3 }],
    note: "",
  };
}

describe("GET /admin/companies/:companyId/subscriptions", () => {
  it("rend les paniers de TOUS les membres, et nomme leur porteur", async () => {
    const company = await createCompany(ctx.prisma, {
      raisonSociale: "Café des Halles SAS",
      status: CompanyStatus.active,
    });
    const member = await createUser(ctx.prisma, {
      auth0Sub: MEMBER,
      firstName: "Léa",
      lastName: "Martin",
    });
    const colleague = await createUser(ctx.prisma, {
      auth0Sub: COLLEAGUE,
      email: "paul@exemple.fr",
      firstName: "Paul",
      lastName: "Durand",
    });
    await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
    await attachTo(ctx.prisma, colleague.id, company.id, CustomerRole.orders);
    // Un client hors du compte : son panier ne doit pas entrer dans la liste.
    await createUser(ctx.prisma, { auth0Sub: OUTSIDER, email: "solo@exemple.fr" });

    await ctx.asSub(MEMBER).post("/subscriptions").send(weeklyPickup("VIE-001")).expect(201);
    await ctx.asSub(COLLEAGUE).post("/subscriptions").send(weeklyPickup("VIE-002")).expect(201);
    await ctx.asSub(OUTSIDER).post("/subscriptions").send(weeklyPickup("PAI-001")).expect(201);

    const rows = jsonBody<readonly AdminSubscriptionRow[]>(
      await ctx.asSub("staff-e2e").get(`/admin/companies/${company.id}/subscriptions`).expect(200),
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.placedByName).sort()).toEqual(["Léa Martin", "Paul Durand"]);
    expect(rows.flatMap((row) => row.lines.map((line) => line.sku)).sort()).toEqual([
      "VIE-001",
      "VIE-002",
    ]);
  });

  it("rend une liste vide pour un compte sans panier", async () => {
    const company = await createCompany(ctx.prisma, {
      raisonSociale: "Sans abonnement SAS",
      status: CompanyStatus.active,
    });

    const rows = jsonBody<readonly AdminSubscriptionRow[]>(
      await ctx.asSub("staff-e2e").get(`/admin/companies/${company.id}/subscriptions`).expect(200),
    );

    expect(rows).toEqual([]);
  });
});
