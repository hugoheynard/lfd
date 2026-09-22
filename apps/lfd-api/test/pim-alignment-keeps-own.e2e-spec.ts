/**
 * E2E — **s'aligner ne détruit pas ce qu'on portait**, sur un vrai Postgres.
 *
 * 🔴 Régression. `Variant.follows` promet ceci, noir sur blanc :
 *
 * > Le geste ne touche **que le drapeau**. La fiche propre, si elle existait,
 * > reste en place et dort : s'aligner puis se désaligner rend ce qu'on avait
 * > écrit, plutôt que de le détruire au passage.
 *
 * C'était faux. `PrismaProductRepository.save` persistait `product.snapshot()`,
 * qui **résout** l'héritage : une déclinaison alignée en sort avec le prix du
 * défaut, et l'`upsert` l'écrivait dans sa colonne PROPRE. Le prix qu'elle
 * portait était donc écrasé — par le geste d'alignement lui-même, qui sauve
 * dans la foulée, puis par les douze autres appelants de `save` (renommer,
 * publier, archiver, ajouter une déclinaison…).
 *
 * Ce que seul ce niveau prouve : **ce que la base a gardé**. Un test d'agrégat
 * dit ce que le domaine a décidé ; l'écart vivait entre le domaine et la
 * colonne, là où aucun test unitaire ne regarde.
 *
 * ⚠️ Les lecteurs ne perdent rien à ce que la colonne ne soit plus résolue :
 * ils passent tous par l'agrégat (`CatalogueReader.publishable` fait
 * `listAll().map(p => p.snapshot())`) et reçoivent la résolution À LA LECTURE.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const CATEGORIES = "/pim/catalogue/categories";
const PRODUCTS = "/pim/catalogue/products";

/** Le prix PROPRE de la seconde déclinaison — celui qui disparaissait. */
const OWN_PRICE = 690;
/** Celui du défaut, qui venait l'écraser. */
const DEFAULT_PRICE = 250;

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
  ctx.http().set("Authorization", "Bearer staff-e2e");

interface Detail {
  readonly variants: readonly {
    readonly id: string;
    readonly isDefault: boolean;
    readonly priceCents: number | null;
    readonly weightGrams: number | null;
    readonly pricingFollowsDefault: boolean;
  }[];
}

async function variantsOf(id: string): Promise<Detail["variants"]> {
  const response = await staff().get(`${PRODUCTS}/${id}`);
  expect(response.status).toBe(200);
  return jsonBody<Detail>(response).variants;
}

/**
 * Une fiche, son défaut tarifé, et une seconde déclinaison au prix PROPRE.
 *
 * Le suffixe évite le `409` d'unicité entre deux cas : le nom d'une famille est
 * unique, et deux appels sans lui se refuseraient mutuellement.
 */
async function aProductWithTwoPrices(suffix: string): Promise<{
  readonly productId: string;
  readonly variantId: string;
  readonly categoryId: string;
}> {
  const category = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: `Viennoiseries${suffix}` } });
  expect(category.status).toBe(201);
  const categoryId = jsonBody<{ id: string }>(category).id;

  const created = await staff()
    .post(PRODUCTS)
    .send({
      name: { fr: `Croissant${suffix}` },
      kind: "daily",
      categoryId,
    });
  expect(created.status).toBe(201);
  const productId = jsonBody<{ id: string }>(created).id;

  const [defaultVariant] = await variantsOf(productId);
  const pricedDefault = await staff()
    .put(`${PRODUCTS}/${productId}/variants/${defaultVariant?.id ?? ""}/pricing`)
    .send({ priceCents: DEFAULT_PRICE, weightGrams: 80 });
  expect([200, 204]).toContain(pricedDefault.status);

  const added = await staff()
    .post(`${PRODUCTS}/${productId}/variants`)
    .send({ name: { fr: "Boîte de 220 g" }, options: { poids: "220 g" } });
  expect(added.status).toBe(201);
  const variantId = jsonBody<{ id: string }>(added).id;

  const priced = await staff()
    .put(`${PRODUCTS}/${productId}/variants/${variantId}/pricing`)
    .send({ priceCents: OWN_PRICE, weightGrams: 220 });
  expect([200, 204]).toContain(priced.status);

  return { productId, variantId, categoryId };
}

async function setAlignment(productId: string, variantId: string, aligned: boolean): Promise<void> {
  const response = await staff()
    .put(`${PRODUCTS}/${productId}/variants/${variantId}/alignment`)
    .send({ aspect: "pricing", aligned });
  expect([200, 204]).toContain(response.status);
}

describe("s'aligner sur le défaut ne détruit pas son propre tarif", () => {
  /**
   * 🔴 Le cas qui échouait. L'alignement sauve l'agrégat dans la foulée, et la
   * sauvegarde écrivait le prix RÉSOLU — celui du défaut — dans la colonne
   * propre de la déclinaison. Se désaligner rendait alors 250 au lieu de 690.
   */
  it("rend le prix propre quand on se désaligne", async () => {
    const { productId, variantId } = await aProductWithTwoPrices("-a");

    await setAlignment(productId, variantId, true);
    await setAlignment(productId, variantId, false);

    const variant = (await variantsOf(productId)).find((row) => row.id === variantId);
    expect(variant?.pricingFollowsDefault).toBe(false);
    expect(variant?.priceCents).toBe(OWN_PRICE);
    expect(variant?.weightGrams).toBe(220);
  });

  /**
   * Pendant l'alignement, la LECTURE doit bien rendre le prix du défaut : c'est
   * tout l'intérêt du drapeau. Ce cas tient l'autre moitié — corriger
   * l'écriture ne doit pas casser la résolution.
   */
  it("rend le prix du défaut tant qu’elle est alignée", async () => {
    const { productId, variantId } = await aProductWithTwoPrices("-b");

    await setAlignment(productId, variantId, true);

    const variant = (await variantsOf(productId)).find((row) => row.id === variantId);
    expect(variant?.pricingFollowsDefault).toBe(true);
    expect(variant?.priceCents).toBe(DEFAULT_PRICE);
  });

  /**
   * Le geste le plus courant, et le plus traître : renommer la fiche appelle
   * `save` sans rien vouloir dire du tarif. Il écrasait quand même.
   */
  it("survit à un renommage du produit pendant l’alignement", async () => {
    const { productId, variantId, categoryId } = await aProductWithTwoPrices("-c");
    await setAlignment(productId, variantId, true);

    const renamed = await staff()
      .put(`${PRODUCTS}/${productId}/identity`)
      .send({ name: { fr: "Croissant au beurre" }, kind: "daily", categoryId });
    expect([200, 204]).toContain(renamed.status);

    await setAlignment(productId, variantId, false);

    const variant = (await variantsOf(productId)).find((row) => row.id === variantId);
    expect(variant?.priceCents).toBe(OWN_PRICE);
  });
});
