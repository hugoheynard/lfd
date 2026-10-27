/**
 * E2E de la **propagation des allergènes d'un ingrédient** à ses fiches
 * (`documentation/pim/plan-propager-allergenes-d-un-ingredient.md`, lot P1) —
 * sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve : le port qui lit les citations à travers la
 * provenance, l'écriture par la table des allergènes, et UN fait de journal
 * par déclinaison écrite, qui nomme l'ingrédient d'origine.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const INGREDIENTS = "/pim/ingredients";
const CATEGORIES = "/pim/catalogue/categories";
const PRODUCTS = "/pim/catalogue/products";

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

interface PropagationRow {
  readonly added: string[];
  readonly removed: string[];
  readonly products: {
    readonly productId: string;
    readonly status: string;
    readonly variants: {
      readonly variantId: string;
      readonly toAdd: string[];
      readonly toRemove: string[];
      readonly undeclared: boolean;
    }[];
  }[];
  readonly counts: Record<string, number>;
}

async function anIngredient(key: string, codes: readonly string[]): Promise<string> {
  await staff()
    .post(INGREDIENTS)
    .send({ key, name: { fr: "Farine T65" }, origin: "" })
    .expect(201);
  await staff().put(`${INGREDIENTS}/${key}/allergens`).send({ codes }).expect(200);
  return key;
}

/** Une fiche qui cite l'ingrédient, sa déclinaison par défaut déclarée comme demandé. */
async function aCitingProduct(
  categoryId: string,
  name: string,
  ingredientKey: string,
  declared: readonly string[] | null,
): Promise<{ productId: string; variantId: string }> {
  const created = await staff()
    .post(PRODUCTS)
    .send({ name: { fr: name }, kind: "daily", categoryId })
    .expect(201);
  const productId = jsonBody<{ id: string }>(created).id;
  const detail = await staff().get(`${PRODUCTS}/${productId}`).expect(200);
  const variantId = jsonBody<{ variants: { id: string }[] }>(detail).variants[0]?.id ?? "";
  await staff()
    .put(`/pim/products/${productId}/ingredients`)
    .send({ keys: [ingredientKey] })
    .expect(200);
  if (declared !== null) {
    await staff()
      .put(`${PRODUCTS}/${productId}/variants/${variantId}/allergens`)
      .send({ allergens: declared })
      .expect(200);
  }
  return { productId, variantId };
}

async function aCategory(): Promise<string> {
  const response = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: "Pains" } })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

describe("propager l'allergène ajouté à un ingrédient", () => {
  it("prévoit, puis applique aux seules déclarations renseignées, avec un fait par fiche", async () => {
    const farine = await anIngredient("farine-t65", ["UW"]);
    const categoryId = await aCategory();
    const none = await aCitingProduct(categoryId, "Pain sans rien", farine, []);
    const listed = await aCitingProduct(categoryId, "Pain au lait", farine, ["SH"]);
    const empty = await aCitingProduct(categoryId, "Pain à déclarer", farine, null);

    const preview = jsonBody<PropagationRow>(
      await staff().get(`${INGREDIENTS}/${farine}/allergen-propagation?added=UW`).expect(200),
    );
    expect(preview.added).toEqual(["UW"]);
    expect(preview.counts).toMatchObject({ productsTouched: 3, toReceive: 2, undeclared: 1 });
    expect(
      preview.products.find((p) => p.productId === empty.productId)?.variants[0],
    ).toMatchObject({ undeclared: true, toAdd: [] });

    const after = jsonBody<PropagationRow>(
      await staff()
        .post(`${INGREDIENTS}/${farine}/allergen-propagation`)
        .send({ added: ["UW"], removed: [] })
        .expect(200),
    );
    expect(after.counts).toMatchObject({ toReceive: 0, alreadyDeclared: 2, undeclared: 1 });

    const sheets = await ctx.prisma.variantAllergens.findMany({
      where: { variantId: { in: [none.variantId, listed.variantId] } },
      select: { variantId: true },
    });
    expect(sheets).toHaveLength(2);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "product.allergens_saved" },
      select: { subjectId: true, payload: true },
    });
    const propagated = facts.filter((fact) =>
      JSON.stringify(fact.payload).includes('"fromIngredient"'),
    );
    expect(propagated.map((fact) => fact.subjectId).sort()).toEqual(
      [none.productId, listed.productId].sort(),
    );
  });

  it("n'écrit pas le retrait d'une déclinaison décochée", async () => {
    const farine = await anIngredient("farine-t65", []);
    const categoryId = await aCategory();
    const kept = await aCitingProduct(categoryId, "Pain d'atelier", farine, ["UW"]);
    const lost = await aCitingProduct(categoryId, "Pain ordinaire", farine, ["UW", "SH"]);

    const after = jsonBody<PropagationRow>(
      await staff()
        .post(`${INGREDIENTS}/${farine}/allergen-propagation`)
        .send({ added: [], removed: ["UW"], removalsKept: [kept.variantId] })
        .expect(200),
    );

    expect(after.counts).toMatchObject({ toLose: 1 });
    expect(
      after.products.find((p) => p.productId === lost.productId)?.variants[0]?.toRemove,
    ).toEqual([]);
  });

  it("répond 404 sur un ingrédient inconnu", async () => {
    await staff().get(`${INGREDIENTS}/inconnu/allergen-propagation?added=UW`).expect(404);
  });
});
