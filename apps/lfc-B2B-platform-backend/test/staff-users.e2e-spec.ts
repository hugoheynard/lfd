/**
 * E2E de l'**annuaire staff** (back-office) : CRUD staff-gated + invariants du
 * repository — e-mail unique (doublon → 409), périmètre dédoublonné, 404 sur id
 * inconnu. Tout est staff-only (aucune surface publique).
 */
import type { CreatedStaffUserResponse, StaffUserView } from "@lfd/contracts";

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

const user = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  firstName: "Alex",
  lastName: "Martin",
  email: "alex.martin@lfc.test",
  scopes: ["commercial"],
  ...over,
});

async function create(over: Record<string, unknown> = {}): Promise<string> {
  const response = await staff().post("/admin/staff-users").send(user(over)).expect(201);
  return jsonBody<CreatedStaffUserResponse>(response).id;
}

async function list(): Promise<readonly StaffUserView[]> {
  const response = await staff().get("/admin/staff-users").expect(200);
  return jsonBody<readonly StaffUserView[]>(response);
}

describe("annuaire staff", () => {
  it("crée un user et le liste avec son périmètre", async () => {
    await create({ scopes: ["commercial", "comptabilite"] });
    const users = await list();
    expect(users).toHaveLength(1);
    expect(users[0]?.email).toBe("alex.martin@lfc.test");
    expect(users[0]?.scopes).toEqual(["commercial", "comptabilite"]);
  });

  it("dédoublonne le périmètre et normalise l'e-mail en minuscule", async () => {
    await create({ email: "Alex.Martin@LFC.test", scopes: ["admin", "admin", "commercial"] });
    const users = await list();
    expect(users[0]?.email).toBe("alex.martin@lfc.test");
    expect(users[0]?.scopes).toEqual(["admin", "commercial"]);
  });

  it("refuse un e-mail déjà pris (409), casse insensible", async () => {
    await create({ email: "dup@lfc.test" });
    const response = await staff()
      .post("/admin/staff-users")
      .send(user({ email: "DUP@lfc.test", firstName: "Bea" }));
    expect(response.status).toBe(409);
    expect(await list()).toHaveLength(1);
  });

  it("édite un user (nom + périmètre)", async () => {
    const id = await create();
    await staff()
      .patch(`/admin/staff-users/${id}`)
      .send(user({ lastName: "Durand", scopes: ["admin"] }))
      .expect(204);
    const users = await list();
    expect(users[0]?.lastName).toBe("Durand");
    expect(users[0]?.scopes).toEqual(["admin"]);
  });

  it("refuse d'éditer vers l'e-mail d'un autre user (409)", async () => {
    const first = await create({ email: "one@lfc.test" });
    await create({ email: "two@lfc.test", firstName: "Bea" });
    const response = await staff()
      .patch(`/admin/staff-users/${first}`)
      .send(user({ email: "two@lfc.test" }));
    expect(response.status).toBe(409);
  });

  it("supprime un user", async () => {
    const id = await create();
    await staff().delete(`/admin/staff-users/${id}`).expect(204);
    expect(await list()).toHaveLength(0);
  });

  it("404 sur édition/suppression d'un id inconnu", async () => {
    await staff().patch("/admin/staff-users/nope").send(user()).expect(404);
    await staff().delete("/admin/staff-users/nope").expect(404);
  });
});
