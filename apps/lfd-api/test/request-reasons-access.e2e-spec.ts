/**
 * E2E du **droit des motifs des demandes** (Hugo, 2026-10-13) — vrai
 * Postgres, vrais rôles.
 *
 * `/admin/request-reasons*` passe sous `b2b_request_reasons`. Ce que seul
 * l'e2e prouve : que `b2b_contact` ne l'ouvre plus, que la boîte des demandes
 * reste sous `b2b_contact`, et que la lecture publique des motifs — celle des
 * formulaires de la boutique — ne demande aucun droit.
 */
import type { CreatedIdResponse, RequestReasonPayload, RoleGrant } from "@lfd/contracts";

import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

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

/** Un membre du staff dont le rôle porte exactement `grants`. */
async function staffWith(key: string, grants: readonly RoleGrant[]): Promise<string> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/staff-roles")
    .send({ key, label: key, grants })
    .expect(201);
  const sub = `staff-${key}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: key,
      email: `${key}@lfc.test`,
      role: null,
      roleKey: key,
      status: "active",
      auth0Id: sub,
    },
  });
  return sub;
}

const REASON: RequestReasonPayload = {
  kind: "contact",
  label: { fr: "Une question", en: "A question", it: "" },
  recipientEmail: "contact@lfc.test",
  position: 0,
  active: true,
  audience: "both",
  priority: "medium",
};

describe("b2b_contact n'ouvre plus les motifs", () => {
  it("contact en écriture : 403 sur les motifs, la boîte des demandes reste lisible", async () => {
    const sub = await staffWith("contact-ancien", [{ resource: "b2b_contact", action: "write" }]);
    const as = () => ctx.asSub(sub);

    await as().get("/admin/request-reasons?kind=contact").expect(403);
    await as().post("/admin/request-reasons").send(REASON).expect(403);
    await as().get("/admin/customer-requests?status=pending").expect(200);
  });
});

describe("b2b_request_reasons", () => {
  it("en lecture : liste les motifs, n'en crée pas, n'ouvre pas la boîte", async () => {
    const sub = await staffWith("motifs-lecture", [
      { resource: "b2b_request_reasons", action: "read" },
    ]);

    await ctx.asSub(sub).get("/admin/request-reasons?kind=contact").expect(200);
    await ctx.asSub(sub).post("/admin/request-reasons").send(REASON).expect(403);
    await ctx.asSub(sub).get("/admin/customer-requests?status=pending").expect(403);
  });

  it("en écriture : crée, révise et archive un motif", async () => {
    const sub = await staffWith("motifs-ecriture", [
      { resource: "b2b_request_reasons", action: "write" },
    ]);

    const created = await ctx.asSub(sub).post("/admin/request-reasons").send(REASON).expect(201);
    const { id } = jsonBody<CreatedIdResponse>(created);
    await ctx
      .asSub(sub)
      .put(`/admin/request-reasons/${id}`)
      .send({ ...REASON, position: 1 })
      .expect(204);
    await ctx.asSub(sub).post(`/admin/request-reasons/${id}/archive`).expect(204);
  });
});

describe("la lecture publique des motifs", () => {
  it("ne demande aucun droit : les formulaires de la boutique les lisent", async () => {
    await ctx.asSub(E2E_STAFF_SUB).post("/admin/request-reasons").send(REASON).expect(201);

    await ctx.http().get("/request-reasons?kind=contact&audience=b2c").expect(200);
  });
});
