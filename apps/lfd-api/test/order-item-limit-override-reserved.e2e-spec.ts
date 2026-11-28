/**
 * E2E — la saisie de l'équipe passe outre la limite d'un produit **même
 * quand la commande porte aussi un article réservé** (sur mesure) attribué à
 * la société. Signalé par Hugo le 2026-11-27 : refusée avec le droit
 * `lfc_product_limit_override`. La variante sans l'article réservé est le
 * témoin : elle passe.
 */
import { CardProviders } from "../src/payment/card/domain/ports/card-providers.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  E2E_STAFF_SUB,
  bootstrapE2e,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble } from "./order-factory.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const LIMITED = "VIE-001-1";
const RESERVED = "PAI-001-1";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;
let pickupId = "";
let companyId = "";
let buyerUserId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: CardProviders, value: cardGatewayDouble("pi_ovr_res") },
      { token: AdminTokenVerifier, value: stubAdminVerifier },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  pickupId = (
    await ctx.prisma.site.create({
      data: {
        label: "Labo",
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
        isDefault: true,
      },
    })
  ).id;
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const member = await createUser(ctx.prisma, { auth0Sub: "auth0|res", email: "res@test.fr" });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  companyId = company.id;
  buyerUserId = member.id;
  await ctx.prisma.orderCutoff.create({
    data: { pickupAddressId: null, weekday: null, daysBefore: 1, time: "00:01", graceMinutes: 0 },
  });
  // Limite « 60 jours avant », case cochée : la même scène que le e2e voisin.
  await ctx.prisma.catalogItem.update({
    where: { sku: LIMITED },
    data: {
      orderLimitDaysBefore: 60,
      orderLimitTime: "23:59",
      orderLimitGraceMinutes: 0,
      orderLimitStaffMayExceed: true,
    },
  });
});

/** Sur mesure : coché au catalogue, puis attribué à la société par le vrai geste. */
async function reserveForCompany(): Promise<void> {
  await ctx.prisma.catalogItem.update({ where: { sku: RESERVED }, data: { customRecipe: true } });
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put(`/admin/catalog/${RESERVED}/reservations/${companyId}`)
    .expect(204);
}

let day = serviceDay(30);

function body(
  skus: readonly string[],
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    companyId,
    buyerUserId,
    settlement: "link",
    requestedDeliveryDate: day,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    deliveryAddress: null,
    deliveryAddressId: null,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: skus.map((sku) => ({ sku, quantity: 2 })),
    ...over,
  };
}

function place(skus: readonly string[]) {
  return ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/orders")
    .set(INTENT_KEY, freshIntent())
    .send(body(skus, { itemLimitOverrideReason: "Demande du client" }));
}

describe("passer outre la limite d'un produit, avec un article sur mesure dans la commande", () => {
  it("témoin : sans l'article sur mesure, la saisie passe", async () => {
    await place([LIMITED]).expect(201);
  });

  it("avec l'article sur mesure attribué à la société, la saisie passe aussi", async () => {
    await reserveForCompany();

    const response = await place([RESERVED, LIMITED]);

    expect({ status: response.status, body: jsonBody(response) }).toMatchObject({ status: 201 });
  });

  it("l'estimation ne bloque pas non plus", async () => {
    await reserveForCompany();

    const response = await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/orders/estimate")
      .send(body([RESERVED, LIMITED]))
      .expect(200);

    expect(jsonBody<{ refusal: unknown }>(response).refusal).toBeNull();
  });
});

describe("la limite « 2 jours avant » pour demain, règle générale « la veille à 23 h 59 »", () => {
  beforeEach(async () => {
    day = serviceDay(1);
    await ctx.prisma.orderCutoff.deleteMany({});
    await ctx.prisma.orderCutoff.create({
      data: { pickupAddressId: null, weekday: null, daysBefore: 1, time: "23:59", graceMinutes: 0 },
    });
    await ctx.prisma.catalogItem.update({
      where: { sku: LIMITED },
      data: {
        orderLimitDaysBefore: 2,
        orderLimitTime: "23:59",
        orderLimitGraceMinutes: 0,
        orderLimitStaffMayExceed: true,
      },
    });
  });
  afterEach(() => {
    day = serviceDay(30);
  });

  it("témoin : le produit limité seul passe, avec motif", async () => {
    await place([LIMITED]).expect(201);
  });

  // Prouve que la scène mord : sans motif, la limite dépassée est nommée.
  it("la limite mord : sans motif, le dépassement est exigé", async () => {
    const response = await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/orders")
      .set(INTENT_KEY, freshIntent())
      .send(body([LIMITED]));
    expect({ status: response.status, body: jsonBody(response) }).toMatchObject({ status: 409 });
  });

  it("avec l'article sur mesure attribué : passe", async () => {
    await reserveForCompany();
    const response = await place([RESERVED, LIMITED]);
    expect({ status: response.status, body: jsonBody(response) }).toMatchObject({ status: 201 });
  });

  // Témoin du ET de la résolution : un article ORDINAIRE dont la case n'est pas
  // cochée refuse la commande, avec le droit et un motif.
  it("témoin : un article ordinaire à limite non dépassable refuse", async () => {
    await ctx.prisma.catalogItem.update({
      where: { sku: RESERVED },
      data: {
        orderLimitDaysBefore: 2,
        orderLimitTime: "23:59",
        orderLimitGraceMinutes: 0,
        orderLimitStaffMayExceed: false,
      },
    });
    const response = await place([RESERVED, LIMITED]);
    expect({ status: response.status, body: jsonBody(response) }).toMatchObject({ status: 409 });
  });

  // Le ET s'applique aussi à l'article sur mesure attribué : sa propre limite,
  // case non cochée, refuse toute la commande — le refus est légitime, c'est
  // la cause la plus plausible d'un refus en production.
  it("l'article sur mesure à limite non dépassable refuse, comme un ordinaire", async () => {
    await reserveForCompany();
    await ctx.prisma.catalogItem.update({
      where: { sku: RESERVED },
      data: {
        orderLimitDaysBefore: 2,
        orderLimitTime: "23:59",
        orderLimitGraceMinutes: 0,
        orderLimitStaffMayExceed: false,
      },
    });
    const response = await place([RESERVED, LIMITED]);
    expect(response.status).toBe(409);
  });
});
