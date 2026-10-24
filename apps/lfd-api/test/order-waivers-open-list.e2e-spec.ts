/**
 * E2E : **la liste transverse des dérogations** (Réglages › Commandes › Heure
 * limite, `documentation/commandes/passation/plan-reglages-commandes.md`, lot O1c).
 *
 * Ce que seule cette suite prouve : la lecture `GET /admin/order-cutoff-waivers`
 * traverse le vrai SQL — toutes sociétés, journée passée exclue (comparée à
 * une colonne DATE), client et auteur nommés — et reste sous
 * `b2b_order_waivers`, pas sous les réglages.
 */
import type { OpenOrderCutoffWaiverView, RoleGrant } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const WAIVERS = "/admin/order-cutoff-waivers";
const REASON = "Client bloqué en tournée";
/** La raison sociale de `createCompany`, sans enseigne : c'est donc elle qui nomme le client. */
const COMPANY_NAME = "Café de Test SAS";
/** Journées calculées UNE fois : fixture et assertion visent les mêmes. */
const TODAY = serviceDay(0);
const LATER = serviceDay(3);
const YESTERDAY = serviceDay(-1);

let ctx: E2eContext;
let companyId: string;

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
  companyId = (await createCompany(ctx.prisma)).id;
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function grant(fulfillmentDate: string): Promise<string> {
  const response = await staff()
    .post(WAIVERS)
    .send({ companyId, fulfillmentDate, reason: REASON })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

/** Un rôle créé à l'écran, qui ne tient que ces droits, et une personne qui le porte. */
async function holderOf(key: string, grants: readonly RoleGrant[]) {
  await staff().post("/admin/staff-roles").send({ key, label: key, grants }).expect(201);
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
  return ctx.asSub(sub);
}

describe("la liste des dérogations d'actualité", () => {
  it("rend celles dont la journée n'est pas passée, la plus proche d'abord, nommées", async () => {
    await grant(YESTERDAY);
    const later = await grant(LATER);
    const today = await grant(TODAY);

    const list = jsonBody<OpenOrderCutoffWaiverView[]>(await staff().get(WAIVERS).expect(200));

    expect(list.map((waiver) => waiver.id)).toEqual([today, later]);
    expect(list[0]).toMatchObject({
      companyId,
      companyName: COMPANY_NAME,
      fulfillmentDate: TODAY,
      reason: REASON,
      grantedByStaffId: E2E_STAFF_ID,
      grantedByName: "Opérateur E2E",
      usedByOrderId: null,
    });
  });

  it("ne cache pas la route d'un client derrière la liste", async () => {
    await grant(LATER);

    const mine = jsonBody<unknown[]>(await staff().get(`${WAIVERS}/${companyId}`).expect(200));

    expect(mine).toHaveLength(1);
  });
});

describe("la liste des dérogations — le mur", () => {
  it("s'ouvre à qui lit les dérogations", async () => {
    const agent = await holderOf("derogations", [
      { resource: "b2b_order_waivers", action: "read" },
    ]);

    await agent.get(WAIVERS).expect(200);
  });

  it("reste fermée à qui ne tient que le réglage des commandes", async () => {
    // La règle et l'exception ne sont pas le même droit (plan §3.4).
    const agent = await holderOf("reglage", [
      { resource: "lfc_order_settings", action: "write" },
      { resource: "b2b_settings", action: "write" },
    ]);

    expect((await agent.get(WAIVERS)).status).toBe(403);
  });
});
