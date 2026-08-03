/**
 * E2E des **points de retrait** (globaux) : lecture publique + gestion staff
 * (ajouter / défaut / supprimer). Éprouve les invariants tenus par le repository :
 * un seul défaut, au moins un point (refus de supprimer le dernier).
 */
import type { CreatedPickupResponse, PickupAddressView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/infra/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

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

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

const point = (label: string): Record<string, unknown> => ({
  label,
  ligne1: "1 rue du Test",
  ligne2: "",
  codePostal: "75001",
  ville: "Paris",
  pays: "France",
  isDefault: false,
});

async function create(label: string): Promise<string> {
  const response = await staff().post("/admin/pickup-addresses").send(point(label)).expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

async function list(): Promise<readonly PickupAddressView[]> {
  const response = await ctx.http().get("/pickup-addresses").expect(200);
  return jsonBody<readonly PickupAddressView[]>(response);
}

describe("points de retrait", () => {
  it("le premier point créé devient le défaut", async () => {
    await create("Labo Paris");
    const points = await list();
    expect(points).toHaveLength(1);
    expect(points[0]?.isDefault).toBe(true);
  });

  it("un seul défaut à la fois ; le défaut remonte en tête", async () => {
    const first = await create("Labo Paris");
    const second = await create("Labo Lyon");

    await staff().patch(`/admin/pickup-addresses/${second}/default`).expect(204);

    const points = await list();
    expect(points[0]?.id).toBe(second);
    expect(points.filter((p) => p.isDefault)).toHaveLength(1);
    expect(points.find((p) => p.id === first)?.isDefault).toBe(false);
  });

  it("supprimer le défaut promeut un autre point", async () => {
    const first = await create("Labo Paris");
    const second = await create("Labo Lyon");

    await staff().delete(`/admin/pickup-addresses/${first}`).expect(204);

    const points = await list();
    expect(points).toHaveLength(1);
    expect(points[0]?.id).toBe(second);
    expect(points[0]?.isDefault).toBe(true);
  });

  it("refuse de supprimer le dernier point (409)", async () => {
    const only = await create("Labo Paris");
    const response = await staff().delete(`/admin/pickup-addresses/${only}`);
    expect(response.status).toBe(409);
    expect(await list()).toHaveLength(1);
  });
});
