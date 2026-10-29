/**
 * E2E — **le pro voit les déclinaisons montrées** (`documentation/catalogue/plan-pro-voit-les-declinaisons.md`, L4).
 *
 * Ce que seul ce niveau prouve : que la déclinaison d'une fiche en vignette
 * traverse le vrai miroir jusqu'à la vitrine pro (quand elle a un prix pro et
 * sa validation pro), jusqu'à la saisie staff (`GET admin/catalog/sellable`)
 * et jusqu'à la grille des bacs — sous SON SKU de vente ; et que le tarif est à
 * plat : une mercuriale posée sur la déclinaison lui vaut, celle posée sur le
 * défaut ne l'atteint pas.
 */
import type {
  AdminPlacedOrderResponse,
  BinCapacitiesView,
  CatalogItemView,
  CreatedIdResponse,
  ShopCatalogueView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { anActiveFiche, relayAll, SILENT_TRIGGER, type Fiche } from "./catalog-facts-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
/** Le prix pro HT de la part, distinct de celui du défaut (1,70616 €). */
const PART_PRO_PRICE_HT = "10";
const PART_MERCURIALE_MILLICENTS = 800_000;
const DEFAULT_MERCURIALE_MILLICENTS = 120_000;
const DAY_MS = 86_400_000;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: OutboxRelayTrigger, value: SILENT_TRIGGER },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

/** Une fiche « Ancolie » en vignette, défaut + « Ancolie part » au prix pro propre. */
async function ancolie(): Promise<{ fiche: Fiche; partSku: string }> {
  const fiche = await anActiveFiche(staff, "Ancolie", "both");
  const added = jsonBody<{ id: string }>(
    await staff()
      .post(`${PRODUCTS}/${fiche.id}/variants`)
      .send({ name: { fr: "Ancolie part" } })
      .expect(201),
  ).id;
  await staff()
    .put(`${PRODUCTS}/${fiche.id}/variants/${added}/pricing`)
    .send({ priceCents: 450, weightGrams: null, proPriceHt: PART_PRO_PRICE_HT })
    .expect(200);
  const detail = jsonBody<{ variants: { id: string; sku: string }[] }>(
    await staff().get(`${PRODUCTS}/${fiche.id}`).expect(200),
  );
  await relayAll(ctx);
  return { fiche, partSku: detail.variants.find((variant) => variant.id === added)?.sku ?? "" };
}

/** Valide pour les deux audiences toutes les lignes en vente, sauf celles écartées. */
async function approveAllBut(...kept: readonly string[]): Promise<void> {
  const skus = (
    await ctx.prisma.catalogItem.findMany({ where: { withdrawnAt: null }, select: { sku: true } })
  )
    .map((row) => row.sku)
    .filter((sku) => !kept.includes(sku));
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus, audiences: ["pro", "public"] })
    .expect(204);
}

async function proShelf(): Promise<readonly string[]> {
  return jsonBody<ShopCatalogueView>(
    await ctx.http().get("/shop/catalogue?audience=pro").expect(200),
  ).items.map((item) => item.sku);
}

async function sellable(): Promise<readonly CatalogItemView[]> {
  return jsonBody<CatalogItemView[]>(await staff().get("/admin/catalog/sellable").expect(200));
}

/** Une société payée au compte, avec son détenteur, et un point de retrait. */
async function aCompany(): Promise<{ companyId: string; buyerId: string; pickupId: string }> {
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: "auth0|ancolie", email: "a@test.fr" });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  return { companyId: company.id, buyerId: buyer.id, pickupId: point.id };
}

/** Fenêtre relative : la mercuriale est comparée à l'horloge (« en vigueur »). */
async function poseMercuriale(companyId: string, sku: string, price: number): Promise<void> {
  const now = Date.now();
  await staff()
    .post(`/admin/pricing/companies/${companyId}/mercuriale`)
    .send({
      label: "Mercuriale Ancolie",
      validFrom: new Date(now - DAY_MS).toISOString(),
      validTo: new Date(now + 30 * DAY_MS).toISOString(),
      lines: [{ sku, unitPriceMillicents: price }],
    })
    .expect(201);
}

type Buyer = Awaited<ReturnType<typeof aCompany>>;

/** Une commande staff de deux parts ; rend le prix unitaire figé sur la ligne. */
async function orderOnePart(
  { companyId, buyerId, pickupId }: Buyer,
  partSku: string,
): Promise<number> {
  const placed = jsonBody<AdminPlacedOrderResponse>(
    await staff()
      .post("/admin/orders")
      .send({
        companyId,
        buyerUserId: buyerId,
        settlement: "account",
        requestedDeliveryDate: serviceDay(),
        fulfillmentMethod: "pickup",
        pickupAddressId: pickupId,
        requestedWindow: { start: "07:00", end: "08:00" },
        lines: [{ sku: partSku, quantity: 2 }],
      })
      .expect(201),
  );
  const line = await ctx.prisma.orderLine.findFirstOrThrow({
    where: { orderId: placed.id, sku: partSku },
    select: { unitPriceMillicents: true },
  });
  return line.unitPriceMillicents;
}

describe("le canal pro voit les déclinaisons montrées", () => {
  it("la vitrine pro sert la part validée pour les pros, et l'attend tant qu'elle ne l'est pas", async () => {
    const { fiche, partSku } = await ancolie();

    await approveAllBut(partSku);
    expect(await proShelf()).toContain(fiche.sku);
    expect(await proShelf()).not.toContain(partSku);

    await approveAllBut();
    expect(await proShelf()).toEqual(expect.arrayContaining([fiche.sku, partSku]));
  });

  it("la saisie staff propose la part sous son SKU, à son prix pro et sous son nom", async () => {
    const { fiche, partSku } = await ancolie();
    await approveAllBut();

    const items = await sellable();

    const part = items.find((item) => item.sku === partSku);
    expect(part?.name).toBe("Ancolie part");
    expect(items.some((item) => item.sku === fiche.sku)).toBe(true);
    expect(part?.unitPriceMillicents).not.toBe(
      items.find((item) => item.sku === fiche.sku)?.unitPriceMillicents,
    );
  });

  it("la grille des bacs liste la part, et y règle une contenance", async () => {
    const { partSku } = await ancolie();
    await approveAllBut();
    const bin = jsonBody<CreatedIdResponse>(
      await staff()
        .post("/admin/delivery/bins")
        .send({
          name: "Bac M",
          outer: { lengthMm: 600, widthMm: 400, heightMm: 220 },
          inner: { lengthMm: 560, widthMm: 360, heightMm: 200 },
          isotherm: false,
          maxStack: 6,
          divisible: true,
        })
        .expect(201),
    ).id;

    await staff()
      .put("/admin/delivery/capacities")
      .send({ binTypeId: bin, sku: partSku, units: 12 })
      .expect(204);

    const grid = jsonBody<BinCapacitiesView>(
      await staff().get("/admin/delivery/capacities").expect(200),
    );
    expect(grid.products.some((product) => product.sku === partSku)).toBe(true);
    expect(grid.capacities).toContainEqual({ binTypeId: bin, sku: partSku, units: 12 });
  });

  it("une commande staff sur la part paie la mercuriale DE la part", async () => {
    const { partSku } = await ancolie();
    await approveAllBut();
    const buyer = await aCompany();
    await poseMercuriale(buyer.companyId, partSku, PART_MERCURIALE_MILLICENTS);

    expect(await orderOnePart(buyer, partSku)).toBe(PART_MERCURIALE_MILLICENTS);
  });

  it("🔴 une mercuriale sur le défaut n'atteint PAS la part (tarif à plat)", async () => {
    const { fiche, partSku } = await ancolie();
    await approveAllBut();
    const buyer = await aCompany();
    await poseMercuriale(buyer.companyId, fiche.sku, DEFAULT_MERCURIALE_MILLICENTS);
    const partBase = (await sellable()).find((item) => item.sku === partSku)?.unitPriceMillicents;

    const paid = await orderOnePart(buyer, partSku);

    expect(paid).not.toBe(DEFAULT_MERCURIALE_MILLICENTS);
    expect(paid).toBe(partBase);
  });
});
