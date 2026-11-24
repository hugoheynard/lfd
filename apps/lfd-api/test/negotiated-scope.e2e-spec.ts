import { randomUUID } from "node:crypto";

import { NEGOTIATED_SCOPE_ERRORS } from "@lfd/contracts";

import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { pickupSite } from "./order-factory.js";
import { cardProvidersOverride } from "./card-payments.js";

/**
 * E2E — **le tarif convenu** (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 sexies, QD8). Un payeur sur devis de période ne commande que ce que sa
 * mercuriale active cite au jour de livraison, que le client commande ou que
 * l'équipe saisisse à sa place.
 *
 * Ce que seul le vrai serveur prouve : le mode lu sur la fiche Chorus en base
 * (posé par Prisma, le geste le refusant encore — S1), la mercuriale lue par
 * la tarification, et le refus qui n'écrit rien.
 */

const BUYER = "auth0|negotiated-scope-buyer";
const SERVICE_DAY = serviceDay();
const CITED = "VIE-001-1";
const NOT_CITED = "PAI-001-1";
const OUTSIDE_MESSAGE = "Cet article n'est pas dans le tarif convenu avec votre service : ";

let ctx: E2eContext;
let pickupId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, cardProvidersOverride("pi_negotiated_scope")],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  pickupId = await pickupSite(ctx.prisma);
});

const staff = () => ctx.asSub(E2E_STAFF_SUB);

interface Payer {
  readonly companyId: string;
  readonly buyerId: string;
}

/** L'armée, active, au compte, sa fiche Chorus au mode donné, et son acheteur. */
async function army(timing: "at_order" | "on_period_quote"): Promise<Payer> {
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
      serviceCodeRequired: false,
      defaultServiceCode: "",
      commitmentTiming: timing,
      checkedOn: new Date("2026-11-01T00:00:00.000Z"),
      checkedByStaffId: E2E_STAFF_ID,
    },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  return { companyId: company.id, buyerId: buyer.id };
}

/**
 * Le tarif convenu, qui cite un article sur deux. Fenêtre relative : la
 * mercuriale est comparée au jour de livraison, lui-même relatif à l'horloge.
 */
async function poseMercuriale(companyId: string): Promise<void> {
  await staff()
    .post(`/admin/pricing/companies/${companyId}/mercuriale`)
    .set(INTENT_KEY, freshIntent())
    .send({
      label: "Tarif convenu de la caserne",
      validFrom: daysAgo(1),
      validTo: `${serviceDay(60)}T00:00:00.000Z`,
      lines: [{ sku: CITED, unitPriceMillicents: 90_000 }],
    })
    .expect(201);
}

/** La passation du client ; le numéro d'engagement arrive sur le devis, `at_order` le porte. */
function customerBasket(sku: string, number?: string): Record<string, unknown> {
  return {
    idempotencyKey: randomUUID(),
    salesTerms: null,
    settlement: "account",
    fulfillmentMethod: "pickup",
    requestedWindow: { start: "07:00", end: "08:00" },
    pickupAddressId: pickupId,
    requestedDeliveryDate: SERVICE_DAY,
    note: "",
    lines: [{ sku, quantity: 6 }],
    ...(number === undefined ? {} : { budgetCommitment: { number, serviceCode: "" } }),
  };
}

function staffEntry({ companyId, buyerId }: Payer, sku: string, number?: string) {
  return staff()
    .post("/admin/orders")
    .set(INTENT_KEY, freshIntent())
    .send({
      companyId,
      buyerUserId: buyerId,
      settlement: "account",
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "pickup",
      pickupAddressId: pickupId,
      requestedWindow: { start: "07:00", end: "08:00" },
      note: "",
      lines: [{ sku, quantity: 6 }],
      ...(number === undefined ? {} : { budgetCommitment: { number, serviceCode: "" } }),
    });
}

describe("un payeur sur devis de période", () => {
  let payer: Payer;

  beforeEach(async () => {
    payer = await army("on_period_quote");
    await poseMercuriale(payer.companyId);
  });

  it("le client commande un article cité : passée", async () => {
    await ctx.asSub(BUYER).post("/orders").send(customerBasket(CITED)).expect(201);

    expect(await ctx.prisma.order.count()).toBe(1);
  });

  it("le client commande un article non cité : 409 nommé, rien n'est écrit", async () => {
    const response = await ctx.asSub(BUYER).post("/orders").send(customerBasket(NOT_CITED));

    expect(response.status).toBe(409);
    const body = jsonBody<{ code: string; message: string }>(response);
    expect(body.code).toBe(NEGOTIATED_SCOPE_ERRORS.outsideScope);
    expect(body.message).toContain(OUTSIDE_MESSAGE);
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("l'équipe saisit un article cité : passée", async () => {
    await staffEntry(payer, CITED).expect(201);

    expect(await ctx.prisma.order.count()).toBe(1);
  });

  it("l'équipe saisit un article non cité : 409 aussi, l'équipe n'échappe pas à la règle", async () => {
    const response = await staffEntry(payer, NOT_CITED);

    expect(response.status).toBe(409);
    const body = jsonBody<{ code: string; message: string }>(response);
    expect(body.code).toBe(NEGOTIATED_SCOPE_ERRORS.outsideScope);
    expect(body.message).toContain(OUTSIDE_MESSAGE);
    expect(await ctx.prisma.order.count()).toBe(0);
  });
});

describe("un payeur qui engage à la commande", () => {
  it("commande un article que sa mercuriale ne cite pas : rien ne le borne", async () => {
    const payer = await army("at_order");
    await poseMercuriale(payer.companyId);

    await ctx
      .asSub(BUYER)
      .post("/orders")
      .send(customerBasket(NOT_CITED, "1300012345"))
      .expect(201);
    await staffEntry(payer, NOT_CITED, "1300012346").expect(201);

    expect(await ctx.prisma.order.count()).toBe(2);
  });
});
