/**
 * E2E du **rayon pro sans jeton** — `GET /shop/catalogue?audience=pro`
 * (Hugo, 2026-10-19 : le visiteur venu de la landing `/pro` voit le tarif pro
 * de BASE, hors taxe).
 *
 * Ce que seul ce niveau prouve : le tarif servi vient du vrai miroir et de la
 * vraie porte, une mercuriale posée en base ne fuit pas vers un anonyme, et
 * les deux vitrines ne se mélangent pas d'un appel à l'autre.
 */
import type { ShopCatalogueView, ShopItemView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

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

/** Suit `seedE2eCatalog` : VIE-001 à 2,00 € HT pro, 250 237 millicentimes HT d'étiquette publique. */
const SKU = "VIE-001";
const PRO_MILLICENTS = 200_000;
const PUBLIC_MILLICENTS = 250_237;
const NEGOTIATED_MILLICENTS = 150_000;

const read = async (query: string): Promise<ShopCatalogueView> =>
  jsonBody<ShopCatalogueView>(await ctx.http().get(`/shop/catalogue${query}`).expect(200));

function itemOf(view: ShopCatalogueView, sku: string): ShopItemView | undefined {
  return view.items.find((item) => item.sku === sku);
}

/** Une mercuriale en vigueur — fenêtre relative à maintenant : elle est comparée à l'horloge. */
async function poseMercuriale(): Promise<void> {
  const company = await createCompany(ctx.prisma);
  await ctx
    .asSub("staff-e2e")
    .post(`/admin/pricing/companies/${company.id}/mercuriale`)
    .send({
      label: "Mercuriale négociée",
      validFrom: daysAgo(30),
      validTo: daysAgo(-365),
      lines: [{ sku: SKU, unitPriceMillicents: NEGOTIATED_MILLICENTS }],
    })
    .expect(201);
}

describe("GET /shop/catalogue?audience=pro", () => {
  it("sert le tarif pro de BASE, hors taxe, sans jeton", async () => {
    const item = itemOf(await read("?audience=pro"), SKU);

    expect(item?.unitPriceMillicents).toBe(PRO_MILLICENTS);
    expect(item?.unitPriceMillicents).not.toBe(PUBLIC_MILLICENTS);
    // Le TTC suit le HT servi, comme pour un pro reconnu : 2,00 € à 5,5 %.
    expect(item?.unitPriceTtcCents).toBe(211);
  });

  it("sans paramètre : la vitrine publique, inchangée", async () => {
    expect(itemOf(await read(""), SKU)?.unitPriceMillicents).toBe(PUBLIC_MILLICENTS);
  });

  it("🔴 une mercuriale posée pour une société ne fuit pas vers l'anonyme", async () => {
    await poseMercuriale();

    const item = itemOf(await read("?audience=pro"), SKU);

    expect(item?.unitPriceMillicents).toBe(PRO_MILLICENTS);
    expect(item).not.toHaveProperty("catalogPriceMillicents");
  });

  it("🔴 ne mélange jamais les deux vitrines d'un appel à l'autre", async () => {
    const publicBefore = await read("");
    const pro = await read("?audience=pro");
    const publicAfter = await read("");
    const proAgain = await read("?audience=pro&lang=en");

    expect(itemOf(publicBefore, SKU)?.unitPriceMillicents).toBe(PUBLIC_MILLICENTS);
    expect(itemOf(pro, SKU)?.unitPriceMillicents).toBe(PRO_MILLICENTS);
    expect(publicAfter).toEqual(publicBefore);
    expect(itemOf(proAgain, SKU)?.unitPriceMillicents).toBe(PRO_MILLICENTS);
  });

  it("isFeatured y est la mise en avant PRO", async () => {
    await ctx
      .asSub("staff-e2e")
      .put(`/admin/catalog/${SKU}-1/featured`)
      .send({ audience: "pro", featured: true })
      .expect(204);

    expect(itemOf(await read("?audience=pro"), SKU)?.isFeatured).toBe(true);
    expect(itemOf(await read(""), SKU)?.isFeatured).toBe(false);
  });

  it.each(["public", "b2b", "PRO"])(
    "refuse une audience inconnue (%s) d'un 400",
    async (audience) => {
      await ctx.http().get(`/shop/catalogue?audience=${audience}`).expect(400);
    },
  );
});
