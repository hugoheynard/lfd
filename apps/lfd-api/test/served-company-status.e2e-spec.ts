/**
 * E2E de **la décision « pro ou pas » sur le statut de la société agissante**
 * (`documentation/comptes-client/plan-pros-en-cours-d-inscription.md`, lot P0).
 *
 * Régression : `CatalogViewers.forCompany` rendait un lecteur pro à TOUTE
 * société agissante, sans lire son statut. Une société suspendue ou terminée
 * lisait le rayon pro, sa mercuriale, et le devis comme la passation la
 * tarifaient pro. Ce que seul le vrai chemin prouve : le statut est relu en
 * base, et chaque chemin — rayon, devis, passation, habituels, suggestions —
 * suit la même décision.
 *
 * Au lot P0 : active → pro ; en attente → pro (inchangé) ; suspendue → public,
 * carte seule ; terminée → commande et devis refusés par leur nom.
 */
import { randomUUID } from "node:crypto";

import type { Response } from "supertest";

import {
  PERSONAL_WORKSPACE,
  WORKSPACE_HEADER,
  weekdayOf,
  type CartSuggestionView,
  type PlacedOrderResponse,
  type ShopCatalogueView,
  type ShopItemView,
  type ShopQuoteView,
  type UsualSuggestionView,
} from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  placedDaysAgo,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { stubAdminVerifier } from "./operations-at-commerce-scene.js";
import { cardGatewayDouble, payByCard, placeOrder } from "./order-factory.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: cardGatewayDouble("pi_statut") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

const MEMBER = "auth0|statut-membre";
const SKU = "VIE-001-1";
const NEGOTIATED_MILLICENTS = 150_000;
/** L'étiquette publique de VIE-001-1 (2,64 € TTC) mise hors taxe à 5,5 %. */
const PUBLIC_MILLICENTS = 250_237;
const CLOSED_CODE = "catalog.company_closed";
const TUESDAY = 2;

let companyId = "";
let memberId = "";
let pickupId = "";

beforeEach(async () => {
  await ctx.reset();
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  memberId = member.id;
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  companyId = company.id;
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
  await poseMercuriale();
});

/** Une mercuriale en vigueur — fenêtre relative à maintenant. */
async function poseMercuriale(): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post(`/admin/pricing/companies/${companyId}/mercuriale`)
    .send({
      label: "Mercuriale négociée",
      validFrom: daysAgo(30),
      validTo: daysAgo(-365),
      lines: [{ sku: SKU, unitPriceMillicents: NEGOTIATED_MILLICENTS }],
    })
    .expect(201);
}

/**
 * Écriture brute GARDÉE : la transition `Company.suspend`/`terminate` a ses
 * propres suites ; ici seul compte le statut que la fabrique relit.
 */
async function setStatus(status: CompanyStatus): Promise<void> {
  await ctx.prisma.company.update({ where: { id: companyId }, data: { status } });
}

const mine = async (): Promise<ShopCatalogueView> =>
  jsonBody<ShopCatalogueView>(await ctx.asSub(MEMBER).get("/shop/catalogue/mine").expect(200));

function itemOf(view: ShopCatalogueView, sku: string): ShopItemView | undefined {
  return view.items.find((item) => item.sku === sku);
}

const quoteMine = () =>
  ctx
    .asSub(MEMBER)
    .post("/shop/quote/mine")
    .send({
      lines: [{ sku: SKU, quantity: 2 }],
      fulfillment: { method: "pickup", pickupAddressId: pickupId },
    });

const placeMine = (workspace?: string) => {
  const call = ctx.asSub(MEMBER).post("/orders");
  return (workspace === undefined ? call : call.set(WORKSPACE_HEADER, workspace)).send({
    idempotencyKey: randomUUID(),
    salesTerms: null,
    fulfillmentMethod: "pickup",
    requestedWindow: { start: "07:00", end: "08:00" },
    pickupAddressId: pickupId,
    deliveryAddress: null,
    deliveryAddressId: null,
    requestedDeliveryDate: serviceDay(),
    note: "",
    lines: [{ sku: SKU, quantity: 2 }],
  });
};

async function placedLinePrice(response: Response): Promise<number | undefined> {
  const placed = jsonBody<PlacedOrderResponse>(response);
  const line = await ctx.prisma.orderLine.findFirst({
    where: { orderId: placed.id, sku: SKU },
    select: { unitPriceMillicents: true },
  });
  return line?.unitPriceMillicents;
}

describe("société active — pro, inchangé", () => {
  it("rayon, devis et passation à la mercuriale", async () => {
    expect(itemOf(await mine(), SKU)?.unitPriceMillicents).toBe(NEGOTIATED_MILLICENTS);
    const quoted = jsonBody<ShopQuoteView>(await quoteMine().expect(200));
    expect(quoted.lines[0]?.unitPriceMillicents).toBe(NEGOTIATED_MILLICENTS);
    expect(await placedLinePrice(await placeMine().expect(201))).toBe(NEGOTIATED_MILLICENTS);
  });
});

describe("société en attente — inchangé au lot P0", () => {
  it("lit et commande toujours au prix pro, mercuriale comprise, par carte", async () => {
    await setStatus(CompanyStatus.pending);

    expect(itemOf(await mine(), SKU)?.unitPriceMillicents).toBe(NEGOTIATED_MILLICENTS);
    const quoted = jsonBody<ShopQuoteView>(await quoteMine().expect(200));
    expect(quoted.lines[0]?.unitPriceMillicents).toBe(NEGOTIATED_MILLICENTS);
    const response = await placeMine().expect(201);
    expect(await placedLinePrice(response)).toBe(NEGOTIATED_MILLICENTS);
    expect(jsonBody<PlacedOrderResponse>(response).payment?.clientSecret).toBeDefined();
  });
});

describe("société suspendue — public, carte seule", () => {
  /** Régression : la suspendue lisait le rayon pro ET sa mercuriale. */
  it("rayon au prix public, sans mercuriale ni tarif barré", async () => {
    await setStatus(CompanyStatus.suspended);

    const item = itemOf(await mine(), SKU);
    expect(item?.unitPriceMillicents).toBe(PUBLIC_MILLICENTS);
    expect(item?.catalogPriceMillicents).toBeUndefined();
  });

  /** Régression : le devis et la passation d'une suspendue tarifaient pro. */
  it("devis et passation au prix public, réglés par carte", async () => {
    await setStatus(CompanyStatus.suspended);

    const quoted = jsonBody<ShopQuoteView>(await quoteMine().expect(200));
    expect(quoted.lines[0]?.unitPriceMillicents).toBe(PUBLIC_MILLICENTS);
    const response = await placeMine().expect(201);
    expect(await placedLinePrice(response)).toBe(PUBLIC_MILLICENTS);
    expect(jsonBody<PlacedOrderResponse>(response).payment?.clientSecret).toBeDefined();
  });

  it("habituels au prix public", async () => {
    await threeTuesdays();
    await setStatus(CompanyStatus.suspended);

    const usuals = jsonBody<UsualSuggestionView[]>(
      await ctx
        .asSub(MEMBER)
        .post("/shop/suggestions/usuals/mine")
        .send({ skus: [], target: null })
        .expect(200),
    );
    expect(usuals.map(({ sku, item }) => [sku, item.unitPriceMillicents])).toEqual([
      [SKU, PUBLIC_MILLICENTS],
    ]);
  });

  it("suggestions du panier au prix public", async () => {
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/suggestions")
      .send({
        trigger: { kind: "product_in_cart", ref: "PAI-001-1" },
        suggestedSkus: [SKU],
        placement: "cart",
        audience: "both",
        startsOn: serviceDay(0),
        endsOn: serviceDay(7),
        phrase: { fr: "Avec une baguette, un croissant" },
        priority: 0,
      })
      .expect(201);
    await setStatus(CompanyStatus.suspended);

    const shown = jsonBody<CartSuggestionView[]>(
      await ctx
        .asSub(MEMBER)
        .post("/shop/suggestions/cart/mine")
        .send({ skus: ["PAI-001-1"], target: null })
        .expect(200),
    );
    expect(shown.map(({ sku, item }) => [sku, item.unitPriceMillicents])).toEqual([
      [SKU, PUBLIC_MILLICENTS],
    ]);
  });
});

describe("société terminée — refus nommé", () => {
  /** Régression : une terminée commandait encore au prix pro. */
  it("refuse le devis et la passation au nom de la société", async () => {
    await setStatus(CompanyStatus.terminated);

    const quoted = await quoteMine().expect(409);
    expect(JSON.stringify(quoted.body)).toContain(CLOSED_CODE);
    const placed = await placeMine().expect(409);
    expect(JSON.stringify(placed.body)).toContain("Ce compte est clos. Contactez-nous.");
  });

  it("laisse la même personne commander en particulier, au prix public", async () => {
    await setStatus(CompanyStatus.terminated);

    const response = await placeMine(PERSONAL_WORKSPACE).expect(201);
    expect(await placedLinePrice(response)).toBe(PUBLIC_MILLICENTS);
  });

  it("lit le rayon au prix public", async () => {
    await setStatus(CompanyStatus.terminated);

    expect(itemOf(await mine(), SKU)?.unitPriceMillicents).toBe(PUBLIC_MILLICENTS);
  });
});

/** Trois commandes des mardis passés, payées, tant que la société est active. */
async function threeTuesdays(): Promise<void> {
  let first = 1;
  while (weekdayOf(serviceDay(-first)) !== TUESDAY) {
    first += 1;
  }
  for (let week = 0; week < 3; week += 1) {
    const back = first + 7 * week;
    const placed = await placeOrder(ctx, {
      buyerUserId: memberId,
      companyId,
      fulfillment: { method: "pickup", pickupSiteId: pickupId },
      forDay: serviceDay(-back),
      placedAt: new Date(placedDaysAgo(back + 1)),
      lines: [{ sku: SKU, quantity: 1 }],
    });
    await payByCard(ctx, placed);
  }
}
