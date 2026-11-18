import { randomUUID } from "node:crypto";

import { BUDGET_COMMITMENT_ERRORS } from "@lfd/contracts";

import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { pickupSite } from "./order-factory.js";
import { cardProvidersOverride } from "./card-payments.js";

/**
 * E2E — **l'engagement budgétaire d'un organisme public** (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 quater, E2′ et E3′).
 *
 * Ce que seul le vrai serveur prouve : la fiche Chorus lue en base au moment
 * de la passation, le refus qui n'écrit rien, les deux colonnes écrites avec
 * la commande et relues par la vue, et la correction par la route staff.
 */

const ARMY_BUYER = "auth0|army-buyer";
const PRO_BUYER = "auth0|pro-buyer";
const SERVICE_DAY = serviceDay();

let ctx: E2eContext;
let armyId = "";
let proId = "";
let pickupId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, cardProvidersOverride("pi_commitment")],
  });
});

afterAll(async () => {
  await ctx.close();
});

/**
 * L'armée, active, au compte (P1b, B1), et sa fiche Chorus : engagement exigé,
 * code service proposé. Écrite par Prisma comme toutes les sociétés des
 * factories (dette notée dans `factories.ts`).
 */
async function army(): Promise<string> {
  const company = await createCompany(ctx.prisma, {
    status: CompanyStatus.active,
    raisonSociale: "Caserne des Alpes",
  });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { formeJuridique: "public_state", grantedTerms: ["monthly"] },
  });
  await ctx.prisma.companyChorusRouting.create({
    data: {
      companyId: company.id,
      commitmentRequired: true,
      serviceCodeRequired: true,
      defaultServiceCode: "SERV-RH",
      checkedOn: new Date("2026-11-01T00:00:00.000Z"),
      checkedByStaffId: E2E_STAFF_ID,
    },
  });
  return company.id;
}

beforeEach(async () => {
  await ctx.reset();
  armyId = await army();
  const pro = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  proId = pro.id;
  await attachTo(
    ctx.prisma,
    (await createUser(ctx.prisma, { auth0Sub: ARMY_BUYER })).id,
    armyId,
    CustomerRole.owner,
  );
  await attachTo(
    ctx.prisma,
    (await createUser(ctx.prisma, { auth0Sub: PRO_BUYER })).id,
    proId,
    CustomerRole.owner,
  );
  pickupId = await pickupSite(ctx.prisma);
});

function basket(commitment?: { number: string; serviceCode: string }): Record<string, unknown> {
  return {
    idempotencyKey: randomUUID(),
    salesTerms: null,
    settlement: "account",
    fulfillmentMethod: "pickup",
    requestedWindow: { start: "07:00", end: "08:00" },
    pickupAddressId: pickupId,
    requestedDeliveryDate: SERVICE_DAY,
    note: "",
    lines: [{ sku: "VIE-001-1", quantity: 6 }],
    ...(commitment === undefined ? {} : { budgetCommitment: commitment }),
  };
}

describe("la passation d'un organisme public", () => {
  it("le panier lit ce que le payeur exige", async () => {
    const view = await ctx.asSub(ARMY_BUYER).get("/me/budget-commitment-requirements").expect(200);

    expect(view.body).toEqual({
      payerCompanyId: armyId,
      publicPayer: true,
      commitmentRequired: true,
      serviceCodeRequired: true,
      defaultServiceCode: "SERV-RH",
    });
  });

  it("sans numéro : 409 nommé, rien n'est écrit", async () => {
    const response = await ctx.asSub(ARMY_BUYER).post("/orders").send(basket());

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe(BUDGET_COMMITMENT_ERRORS.numberRequired);
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("avec le numéro : passée, le code par défaut écrit, la vue staff les rend", async () => {
    const placed = await ctx
      .asSub(ARMY_BUYER)
      .post("/orders")
      .send(basket({ number: "1300012345", serviceCode: "" }))
      .expect(201);
    const { id } = jsonBody<{ id: string }>(placed);

    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id } });
    expect([row.budgetCommitmentNumber, row.budgetCommitmentServiceCode]).toEqual([
      "1300012345",
      "SERV-RH",
    ]);
    const view = await ctx.asSub(E2E_STAFF_SUB).get(`/admin/orders/${id}`).expect(200);
    expect(view.body).toMatchObject({
      budgetCommitment: { number: "1300012345", serviceCode: "SERV-RH" },
    });
  });

  it("un payeur privé qui envoie un numéro : 409, rien n'est écrit", async () => {
    const response = await ctx
      .asSub(PRO_BUYER)
      .post("/orders")
      .send(basket({ number: "1300012345", serviceCode: "" }));

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe(BUDGET_COMMITMENT_ERRORS.privatePayer);
    expect(await ctx.prisma.order.count()).toBe(0);
  });
});

describe("la correction de l'engagement par l'équipe", () => {
  async function placed(): Promise<string> {
    const response = await ctx
      .asSub(ARMY_BUYER)
      .post("/orders")
      .send(basket({ number: "1300000000", serviceCode: "SERV-RH" }))
      .expect(201);
    return jsonBody<{ id: string }>(response).id;
  }

  it("avant facturation : 204, le numéro corrigé et sa trace dans la boîte d'envoi", async () => {
    const id = await placed();

    await ctx
      .asSub(E2E_STAFF_SUB)
      .put(`/admin/orders/${id}/budget-commitment`)
      .send({ budgetCommitment: { number: "1300012345", serviceCode: "SERV-LOG" } })
      .expect(204);

    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id } });
    expect([row.budgetCommitmentNumber, row.budgetCommitmentServiceCode]).toEqual([
      "1300012345",
      "SERV-LOG",
    ]);
  });

  it("retirer un numéro exigé : 409, rien ne change", async () => {
    const id = await placed();

    const response = await ctx
      .asSub(E2E_STAFF_SUB)
      .put(`/admin/orders/${id}/budget-commitment`)
      .send({ budgetCommitment: null });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe(BUDGET_COMMITMENT_ERRORS.numberRequired);
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id } });
    expect(row.budgetCommitmentNumber).toBe("1300000000");
  });

  it("une forme refusée : 400", async () => {
    const id = await placed();

    await ctx
      .asSub(E2E_STAFF_SUB)
      .put(`/admin/orders/${id}/budget-commitment`)
      .send({ budgetCommitment: { number: "1".repeat(51), serviceCode: "" } })
      .expect(400);
  });
});
