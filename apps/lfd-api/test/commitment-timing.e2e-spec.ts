import { randomUUID } from "node:crypto";

import { BUDGET_COMMITMENT_ERRORS, CHORUS_ROUTING_ERRORS } from "@lfd/contracts";

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
 * E2E — **le moment de l'engagement budgétaire** (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 sexies, QD1 et QD2).
 *
 * Le geste de la fiche Chorus refuse `on_period_quote` tant que le devis de
 * période n'est pas bâti : le mode est donc posé en base pour éprouver la
 * passation sans numéro, le refus d'un numéro et la vue des exigences.
 */

const ARMY_BUYER = "auth0|army-quote-buyer";
const SERVICE_DAY = serviceDay();

let ctx: E2eContext;
let armyId = "";
let pickupId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, cardProvidersOverride("pi_commitment_timing")],
  });
});

afterAll(async () => {
  await ctx.close();
});

/** Le relevé tel que l'écran l'envoie. Le jour n'est comparé à aucune horloge. */
const READING = {
  commitmentRequired: true,
  serviceCodeRequired: true,
  defaultServiceCode: "SERV-RH",
  commitmentTiming: "at_order",
  checkedOn: "2026-11-01",
};

const route = (companyId: string): string => `/admin/companies/${companyId}/chorus-routing`;

/** L'armée, active, au compte, avec sa fiche Chorus au mode donné. */
async function army(timing: "at_order" | "on_period_quote"): Promise<string> {
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
      commitmentTiming: timing,
      checkedOn: new Date(`${READING.checkedOn}T00:00:00.000Z`),
      checkedByStaffId: E2E_STAFF_ID,
    },
  });
  await attachTo(
    ctx.prisma,
    (await createUser(ctx.prisma, { auth0Sub: ARMY_BUYER })).id,
    company.id,
    CustomerRole.owner,
  );
  return company.id;
}

beforeEach(async () => {
  await ctx.reset();
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

async function timingOf(companyId: string): Promise<string> {
  const row = await ctx.prisma.companyChorusRouting.findUniqueOrThrow({ where: { companyId } });
  return row.commitmentTiming;
}

describe("le mode sur la fiche Chorus", () => {
  it("se pose à la commande, et la fiche staff le sert", async () => {
    armyId = await army("at_order");

    await ctx.asSub(E2E_STAFF_SUB).put(route(armyId)).send(READING).expect(204);

    const fiche = await ctx.asSub(E2E_STAFF_SUB).get(`/admin/companies/${armyId}`).expect(200);
    expect(fiche.body).toMatchObject({ chorusRouting: { commitmentTiming: "at_order" } });
  });

  it("refuse le devis de période tant qu'il n'est pas disponible : 409, rien n'est écrit", async () => {
    armyId = await army("at_order");

    const response = await ctx
      .asSub(E2E_STAFF_SUB)
      .put(route(armyId))
      .send({ ...READING, commitmentTiming: "on_period_quote" });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe(
      CHORUS_ROUTING_ERRORS.periodQuoteUnavailable,
    );
    expect(await timingOf(armyId)).toBe("at_order");
  });

  it("refuse le devis de période sans engagement exigé : 400", async () => {
    armyId = await army("at_order");

    const response = await ctx
      .asSub(E2E_STAFF_SUB)
      .put(route(armyId))
      .send({ ...READING, commitmentRequired: false, commitmentTiming: "on_period_quote" });

    expect(response.status).toBe(400);
    expect(jsonBody<{ code: string }>(response).code).toBe(
      CHORUS_ROUTING_ERRORS.quoteWithoutCommitment,
    );
  });

  it("refuse de changer de mode sous une commande non facturée : 409", async () => {
    armyId = await army("on_period_quote");
    await ctx.asSub(ARMY_BUYER).post("/orders").send(basket()).expect(201);

    const response = await ctx.asSub(E2E_STAFF_SUB).put(route(armyId)).send(READING);

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe(
      CHORUS_ROUTING_ERRORS.timingLockedByOrders,
    );
    expect(await timingOf(armyId)).toBe("on_period_quote");
  });

  it("revient à la commande quand rien n'attend sa facture", async () => {
    armyId = await army("on_period_quote");

    await ctx.asSub(E2E_STAFF_SUB).put(route(armyId)).send(READING).expect(204);

    expect(await timingOf(armyId)).toBe("at_order");
  });
});

describe("la passation d'un payeur sur devis de période", () => {
  it("la vue des exigences dit le mode et ne propose aucun engagement", async () => {
    armyId = await army("on_period_quote");

    const view = await ctx.asSub(ARMY_BUYER).get("/me/budget-commitment-requirements").expect(200);

    expect(view.body).toEqual({
      payerCompanyId: armyId,
      publicPayer: true,
      commitmentRequired: true,
      serviceCodeRequired: true,
      defaultServiceCode: "SERV-RH",
      timing: "on_period_quote",
      currentCommitment: null,
    });
  });

  it("passe sans numéro, avec le code service de la fiche", async () => {
    armyId = await army("on_period_quote");

    const placed = await ctx.asSub(ARMY_BUYER).post("/orders").send(basket()).expect(201);

    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: jsonBody<{ id: string }>(placed).id },
    });
    expect([row.budgetCommitmentNumber, row.budgetCommitmentServiceCode]).toEqual([
      null,
      "SERV-RH",
    ]);
  });

  it("refuse un numéro saisi : 400 nommé, rien n'est écrit", async () => {
    armyId = await army("on_period_quote");

    const response = await ctx
      .asSub(ARMY_BUYER)
      .post("/orders")
      .send(basket({ number: "1300012345", serviceCode: "" }));

    expect(response.status).toBe(400);
    expect(jsonBody<{ code: string }>(response).code).toBe(BUDGET_COMMITMENT_ERRORS.onQuote);
    expect(await ctx.prisma.order.count()).toBe(0);
  });
});
