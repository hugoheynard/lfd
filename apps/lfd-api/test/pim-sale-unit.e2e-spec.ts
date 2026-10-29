/**
 * E2E — **l'unité de vente d'une déclinaison**, sur un vrai Postgres.
 *
 * Lot P1 de `documentation/pricing/vente-au-poids.md` : la saisie (pièce
 * ou poids, le pas et le minimum en grammes) se relit sur la fiche ; une
 * déclinaison au poids sans pas n'active pas ; l'unité change même après
 * la mise en vente tant que la référence n'a servi nulle part
 * (`plan-changer-l-unite-de-vente.md`, § 8 — le refus d'une référence
 * utilisée est éprouvé par `sale-unit-change.e2e-spec.ts`).
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { makeActivatable } from "./pim-sellable.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
const CATEGORIES = "/pim/catalogue/categories";
const PRICE = { priceCents: 1_240, proPriceHt: "10.5", weightGrams: null } as const;

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
  readonly isDefault: boolean;
  readonly saleUnit: string;
  readonly weightMinGrams: number | null;
  readonly weightStepGrams: number | null;
  readonly hasBeenPublished: boolean;
}

async function aProduct(name: string): Promise<string> {
  const family = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: `Famille ${name}` } })
    .expect(201);
  const categoryId = jsonBody<{ id: string }>(family).id;
  const created = await staff()
    .post(PRODUCTS)
    .send({ name: { fr: name }, kind: "resale", categoryId })
    .expect(201);
  return jsonBody<{ id: string }>(created).id;
}

async function defaultOf(id: string): Promise<VariantDetail> {
  const detail = jsonBody<{ variants: readonly VariantDetail[] }>(
    await staff().get(`${PRODUCTS}/${id}`).expect(200),
  );
  const found = detail.variants.find((variant) => variant.isDefault);
  if (found === undefined) {
    throw new TypeError("la fiche n'a pas de déclinaison par défaut");
  }
  return found;
}

function priceVariant(id: string, variantId: string, body: Readonly<Record<string, unknown>>) {
  return staff()
    .put(`${PRODUCTS}/${id}/variants/${variantId}/pricing`)
    .send({ ...PRICE, ...body });
}

describe("l'unité de vente d'une déclinaison", () => {
  it("naît à la pièce, et se saisit au poids avec son pas et son minimum", async () => {
    const id = await aProduct("Graines au chocolat");
    const variant = await defaultOf(id);
    expect(variant).toMatchObject({
      saleUnit: "piece",
      weightStepGrams: null,
      weightMinGrams: null,
      hasBeenPublished: false,
    });

    await priceVariant(id, variant.id, {
      saleUnit: "weight",
      weightStepGrams: 100,
      weightMinGrams: 200,
    }).expect(200);

    expect(await defaultOf(id)).toMatchObject({
      saleUnit: "weight",
      weightStepGrams: 100,
      weightMinGrams: 200,
    });
  });

  it("refuse un pas posé à la pièce, en le disant, sans rien écrire", async () => {
    const id = await aProduct("Florentin");
    const variant = await defaultOf(id);

    const refus = await priceVariant(id, variant.id, { weightStepGrams: 100 }).expect(400);

    expect(jsonBody<{ code: string }>(refus).code).toBe("catalogue.variant.invalid_sale_terms");
    expect((await defaultOf(id)).weightStepGrams).toBeNull();
  });

  it("n'active pas une déclinaison au poids sans pas, puis l'active avec", async () => {
    const id = await aProduct("Saumon gravlax");
    await makeActivatable(staff, id);
    const variant = await defaultOf(id);
    await priceVariant(id, variant.id, { saleUnit: "weight" }).expect(200);

    const refus = await staff().put(`${PRODUCTS}/${id}/publish`).send({}).expect(409);
    expect(jsonBody<{ message: string }>(refus).message).toContain("pas de vente au poids");

    await priceVariant(id, variant.id, { weightStepGrams: 50 }).expect(200);
    await staff().put(`${PRODUCTS}/${id}/publish`).send({}).expect(200);
    expect((await defaultOf(id)).hasBeenPublished).toBe(true);
  });

  it("change l'unité d'une fiche mise en vente puis retirée, tant que sa référence n'a servi nulle part", async () => {
    const id = await aProduct("Pain de mie");
    await makeActivatable(staff, id);
    const variant = await defaultOf(id);
    await staff().put(`${PRODUCTS}/${id}/publish`).send({}).expect(200);
    await staff().put(`${PRODUCTS}/${id}/unpublish`).send({}).expect(200);

    await priceVariant(id, variant.id, { saleUnit: "weight", weightStepGrams: 100 }).expect(200);

    expect(await defaultOf(id)).toMatchObject({ saleUnit: "weight", hasBeenPublished: true });
  });
});
