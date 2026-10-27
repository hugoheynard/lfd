/**
 * E2E — **le prix pro HT saisi**, sur un vrai Postgres.
 *
 * Lot P de `documentation/catalogue/plan-catalogue-synchronise-par-audience.md` :
 * la saisie (cinq décimales, colonne `pro_price_millicents`) et l'activation
 * qui l'exige. Le pré-remplissage depuis le rapport (lot R2) puis le rapport
 * et sa méthode (lot R3) sont retirés le 2026-10-27
 * (`documentation/pricing/plan-retirer-le-rapport-pro.md`) : le prix pro est
 * toujours saisi.
 */
import { type ProductListView } from "@lfd/pim-contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { makeActivatable } from "./pim-sellable.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
const CATEGORIES = "/pim/catalogue/categories";
const RULES = "/pim/accounting-rules";
const RETIRED_PREFILL = "/pim/accounting-rules/pro-price-prefill";

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

const staff = (): ReturnType<E2eContext["http"]> =>
  ctx.http().set("Authorization", `Bearer ${E2E_STAFF_SUB}`);

interface VariantDetail {
  readonly id: string;
  readonly sku: string;
  readonly isDefault: boolean;
  readonly priceCents: number | null;
  readonly proPriceMillicents: number | null;
}

interface Detail {
  readonly status: string;
  readonly variants: readonly VariantDetail[];
}

async function aProduct(name: string): Promise<string> {
  const family = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: `Famille ${name}` } })
    .expect(201);
  const categoryId = jsonBody<{ id: string }>(family).id;
  const created = await staff()
    .post(PRODUCTS)
    .send({ name: { fr: name }, kind: "daily", categoryId })
    .expect(201);
  return jsonBody<{ id: string }>(created).id;
}

async function detailOf(id: string): Promise<Detail> {
  return jsonBody<Detail>(await staff().get(`${PRODUCTS}/${id}`).expect(200));
}

async function defaultOf(id: string): Promise<VariantDetail> {
  const found = (await detailOf(id)).variants.find((variant) => variant.isDefault);
  if (found === undefined) {
    throw new TypeError("la fiche n'a pas de déclinaison par défaut");
  }
  return found;
}

/** La ligne de la LISTE pour cette fiche — celle que le filtre « Activables » lit. */
async function listed(id: string): Promise<ProductListView> {
  const rows = jsonBody<ProductListView[]>(await staff().get(PRODUCTS).expect(200));
  const row = rows.find((candidate) => candidate.id === id);
  if (row === undefined) {
    throw new TypeError("la fiche manque à la liste");
  }
  return row;
}

function priceVariant(id: string, variantId: string, body: Readonly<Record<string, unknown>>) {
  return staff()
    .put(`${PRODUCTS}/${id}/variants/${variantId}/pricing`)
    .send({ weightGrams: null, ...body });
}

async function declareNoAllergen(id: string, variantId: string): Promise<void> {
  await staff()
    .put(`${PRODUCTS}/${id}/variants/${variantId}/allergens`)
    .send({ allergens: [] })
    .expect(200);
}

describe("la saisie du prix pro HT", () => {
  it("se saisit en euros à cinq décimales et se relit en millicentimes", async () => {
    const id = await aProduct("Tarte");
    const variant = await defaultOf(id);

    await priceVariant(id, variant.id, { priceCents: 3_200, proPriceHt: "27.30331" }).expect(200);

    expect(await defaultOf(id)).toMatchObject({
      priceCents: 3_200,
      proPriceMillicents: 2_730_331,
    });
  });

  it("refuse une sixième décimale, en le disant, sans rien écrire", async () => {
    const id = await aProduct("Tarte");
    const variant = await defaultOf(id);

    const refus = await priceVariant(id, variant.id, {
      priceCents: 3_200,
      proPriceHt: "27.303311",
    }).expect(400);

    expect(jsonBody<{ code: string }>(refus).code).toBe("catalogue.variant.invalid_pro_price");
    expect(jsonBody<{ message: string }>(refus).message).toContain("5 décimales");
    expect((await defaultOf(id)).proPriceMillicents).toBeNull();
  });

  it("garde la saisie quand la section est enregistrée sans le champ", async () => {
    const id = await aProduct("Tarte");
    const variant = await defaultOf(id);
    await priceVariant(id, variant.id, { priceCents: 3_200, proPriceHt: "10" }).expect(200);

    await priceVariant(id, variant.id, { priceCents: 3_300 }).expect(200);

    expect((await defaultOf(id)).proPriceMillicents).toBe(1_000_000);
  });
});

describe("le prix pro saisi, seule source", () => {
  /**
   * Régression (BLOQUANT `vitruve`, lot S, 2026-10-16) : sans aucune règle
   * comptable, « Activer » refusait (`pro_price_rule`) même une déclinaison qui
   * portait son prix pro saisi. Une base sans règles vaut « prix saisi ».
   */
  it("active sans règles comptables une fiche dont le prix pro est saisi", async () => {
    const id = await aProduct("Éclair");
    await makeActivatable(staff, id);
    const variant = await defaultOf(id);
    await declareNoAllergen(id, variant.id);
    // Le décor saisit un prix pro (lot R3) : ce cas part d'une saisie effacée.
    await priceVariant(id, variant.id, { priceCents: 200, proPriceHt: null }).expect(200);

    const refus = await staff().put(`${PRODUCTS}/${id}/publish`).send({}).expect(409);
    expect(jsonBody<{ message: string }>(refus).message).toContain("prix pro HT");

    await priceVariant(id, variant.id, { priceCents: 200, proPriceHt: "1.70616" }).expect(200);
    await staff().put(`${PRODUCTS}/${id}/publish`).send({}).expect(200);
    expect((await detailOf(id)).status).toBe("published");
  });

  it("refuse d'activer une fiche sans prix pro HT, puis l'accepte avec", async () => {
    const id = await aProduct("Tarte");
    await makeActivatable(staff, id);
    const variant = await defaultOf(id);
    await declareNoAllergen(id, variant.id);
    // Le décor saisit un prix pro (lot R3) : ce cas part d'une saisie effacée.
    await priceVariant(id, variant.id, { priceCents: 200, proPriceHt: null }).expect(200);

    // La liste dit « pas activable » avec le jugement même du refus (2026-10-26).
    const before = await listed(id);
    expect(before.activatable).toBe(false);
    expect(Object.keys(before.activationGaps?.byVariant ?? {})).toEqual([variant.sku]);
    const refus = await staff().put(`${PRODUCTS}/${id}/publish`).send({}).expect(409);
    expect(jsonBody<{ code: string }>(refus).code).toBe("catalogue.product.not_activatable");
    expect(jsonBody<{ message: string }>(refus).message).toContain("prix pro HT");

    await priceVariant(id, variant.id, { priceCents: 200, proPriceHt: "1.70616" }).expect(200);
    expect(await listed(id)).toMatchObject({ activatable: true });
    await staff().put(`${PRODUCTS}/${id}/publish`).send({}).expect(200);
    expect((await detailOf(id)).status).toBe("published");
    // Publiée : plus rien à activer.
    expect(await listed(id)).toMatchObject({ activatable: false, activationGaps: null });
  });
});

/**
 * Le pré-remplissage en masse depuis le rapport est retiré le 2026-10-27
 * (lot R2 de `documentation/pricing/plan-retirer-le-rapport-pro.md`) : le prix
 * pro est toujours saisi. La route ne doit plus répondre.
 */
describe("le pré-remplissage retiré", () => {
  it("ne sert plus ni l'aperçu ni l'écriture", async () => {
    await staff().get(RETIRED_PREFILL).expect(404);
    await staff().post(RETIRED_PREFILL).send({}).expect(404);
  });
});

/**
 * Le rapport et sa méthode sont retirés le 2026-10-27 (lot R3) : les règles
 * comptables n'ont plus de route, ni en lecture ni en écriture.
 */
describe("les règles comptables retirées", () => {
  it("ne servent plus ni la lecture, ni le rapport, ni la méthode", async () => {
    await staff().get(RULES).expect(404);
    await staff().put(`${RULES}/pro-price-ratio`).send({ ratioBp: 9_000 }).expect(404);
    await staff().put(`${RULES}/pro-price-method`).send({ method: "ratio_ttc" }).expect(404);
  });
});
