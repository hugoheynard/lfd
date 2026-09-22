/**
 * E2E de la **fiche réglementaire en deux sections** — sur un vrai Postgres.
 *
 * Ce que ce fichier prouve, et que rien d'autre ne peut prouver : **les deux
 * moitiés vivent dans deux tables, et une écriture n'atteint que la sienne**.
 * C'est la raison d'être du plan `plan-separer-allergenes-et-nutrition.md` —
 * une requête qui remplaçait tout obligeait celui qui écrivait une section à
 * renvoyer l'autre, et l'oublier l'effaçait, sur de la donnée d'étiquette.
 *
 * Un test à Prisma stubbé ne dirait rien ici : ce qui est en jeu est ce que
 * l'ADAPTATEUR écrit et ce que la LECTURE recolle, deux tables plus loin.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
const CATEGORIES = "/pim/catalogue/categories";

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
  readonly allergenSheet: {
    readonly declared: readonly string[];
    readonly mayContain: readonly string[];
  } | null;
  readonly nutrition: {
    readonly saltG: number | null;
    readonly energyKcal: number | null;
    readonly carbsG: number | null;
    readonly sugarsG: number | null;
  } | null;
}

async function aProduct(): Promise<{ productId: string; variantId: string }> {
  const family = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: "Viennoiseries" } });
  expect(family.status).toBe(201);
  const created = await staff()
    .post(PRODUCTS)
    .send({
      name: { fr: "Croissant" },
      kind: "daily",
      categoryId: jsonBody<{ id: string }>(family).id,
    });
  expect(created.status).toBe(201);
  const productId = jsonBody<{ id: string }>(created).id;
  const variantId = (await variantOf(productId)).id;
  return { productId, variantId };
}

/** L'état **relu**, jamais celui qu'on espérait — c'est tout l'objet du fichier. */
async function variantOf(productId: string): Promise<VariantDetail> {
  const detail = await staff().get(`${PRODUCTS}/${productId}`).expect(200);
  const [variant] = jsonBody<{ variants: VariantDetail[] }>(detail).variants;
  if (variant === undefined) {
    throw new Error("le produit est né sans déclinaison par défaut");
  }
  return variant;
}

function saveAllergens(
  productId: string,
  variantId: string,
  body: Record<string, unknown>,
): ReturnType<ReturnType<typeof staff>["put"]> {
  return staff().put(`${PRODUCTS}/${productId}/variants/${variantId}/allergens`).send(body);
}

function saveNutrition(
  productId: string,
  variantId: string,
  body: Record<string, unknown>,
): ReturnType<ReturnType<typeof staff>["put"]> {
  return staff().put(`${PRODUCTS}/${productId}/variants/${variantId}/nutrition`).send(body);
}

describe("les deux sections ne se touchent pas", () => {
  /**
   * 🔴 **Le cas qui motive tout le chantier.** Avant la séparation, ce scénario
   * effaçait les allergènes : la requête portait la fiche entière, et un corps
   * sans `allergens` valait « aucun allergène » (bug 0c).
   */
  it("enregistrer la nutrition n'écrit AUCUN allergène", async () => {
    const { productId, variantId } = await aProduct();
    await saveAllergens(productId, variantId, { allergens: ["UW"], mayContain: ["AM"] }).expect(
      200,
    );

    await saveNutrition(productId, variantId, { saltG: 2, energyKcal: 410 }).expect(200);

    const variant = await variantOf(productId);
    expect(variant.allergenSheet).toEqual({ declared: ["UW"], mayContain: ["AM"] });
    expect(variant.nutrition).toMatchObject({ saltG: 2, energyKcal: 410 });
  });

  /** Et l'inverse : déclarer ne remet pas un tableau nutritionnel à zéro. */
  it("enregistrer les allergènes n'efface AUCUNE valeur", async () => {
    const { productId, variantId } = await aProduct();
    await saveNutrition(productId, variantId, { saltG: 2, energyKcal: 410 }).expect(200);

    await saveAllergens(productId, variantId, { allergens: ["UW"] }).expect(200);

    const variant = await variantOf(productId);
    expect(variant.allergenSheet?.declared).toEqual(["UW"]);
    expect(variant.nutrition).toMatchObject({ saltG: 2, energyKcal: 410 });
  });

  /**
   * 🔴 Le tri-état, lu depuis la base. **Pas de ligne** = personne ne s'est
   * prononcé ; il ne devient jamais `[]` par accident, et l'invariant 7 le voit.
   */
  it("la nutrition seule laisse les allergènes à « personne n'a déclaré »", async () => {
    const { productId, variantId } = await aProduct();

    await saveNutrition(productId, variantId, { saltG: 2 }).expect(200);

    const variant = await variantOf(productId);
    expect(variant.allergenSheet).toBeNull();
    // Pas publiable : une déclinaison active sans déclaration ne se vend pas.
    expect((await staff().put(`${PRODUCTS}/${productId}/publish`).send({})).status).toBe(409);
  });

  /** `[]` est une AFFIRMATION, et elle se distingue du silence jusqu'en base. */
  it("« aucun allergène » se relit comme une affirmation, pas comme un silence", async () => {
    const { productId, variantId } = await aProduct();

    await saveAllergens(productId, variantId, { allergens: [] }).expect(200);

    expect((await variantOf(productId)).allergenSheet).toEqual({ declared: [], mayContain: [] });
    expect((await staff().put(`${PRODUCTS}/${productId}/publish`).send({})).status).toBe(200);
  });

  /**
   * Les valeurs seules ne fabriquent pas de ligne d'allergènes, même vide — et
   * depuis le lot 7 ça se LIT : la déclaration est un objet à part, et son
   * absence est `null`, pas un tableau de traces vide posé dans la nutrition.
   */
  it("les valeurs se relisent sans qu'aucune déclaration n'apparaisse", async () => {
    const { productId, variantId } = await aProduct();

    await saveNutrition(productId, variantId, { carbsG: 30, sugarsG: 12 }).expect(200);

    const variant = await variantOf(productId);
    expect(variant.allergenSheet).toBeNull();
    expect(variant.nutrition).toMatchObject({ carbsG: 30, sugarsG: 12 });
  });
});

describe("la section nutrition refuse ce qui n'est pas d'elle", () => {
  /**
   * 🔴 **Sur du réglementaire, un `200` qui n'écrit rien est pire qu'un refus**
   * (§7 du plan). Cette adresse recevait la fiche entière : le front déployé
   * l'appelle encore avec `allergens`, et l'accepter en silence rendrait un
   * succès sur une déclaration de sécurité que personne n'a enregistrée.
   */
  it("refuse (400) un corps qui porte des allergènes, et nomme la route de sortie", async () => {
    const { productId, variantId } = await aProduct();

    const refus = await saveNutrition(productId, variantId, { allergens: [], saltG: 2 });

    expect(refus.status).toBe(400);
    expect(jsonBody<{ message: string }>(refus).message).toContain("/allergens");
    // Et rien n'a été écrit : la valeur non plus.
    expect((await variantOf(productId)).nutrition).toBeNull();
  });

  it("refuse (400) un corps qui porte des traces", async () => {
    const { productId, variantId } = await aProduct();

    const refus = await saveNutrition(productId, variantId, { mayContain: ["AM"] });

    expect(refus.status).toBe(400);
  });

  /** Les refus du domaine restent au domaine — un « dont » ne dépasse pas sa ligne. */
  it("refuse (400) un « dont » plus grand que sa ligne", async () => {
    const { productId, variantId } = await aProduct();

    const refus = await saveNutrition(productId, variantId, { carbsG: 4, sugarsG: 12 });

    expect(refus.status).toBe(400);
    expect(jsonBody<{ code: string }>(refus).code).toBe("catalogue.nutrition.part_exceeds_whole");
  });
});
