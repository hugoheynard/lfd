/**
 * E2E — **l'invariant 7 s'écrit sur les allergènes seuls**, sur un vrai Postgres.
 *
 * Lot 5 de `documentation/pim/plan-separer-allergenes-et-nutrition.md` (D2, D3).
 *
 * 🔴 Ce n'est pas un desserrage. Le règlement (UE) n° 1169/2011 rend les
 * allergènes obligatoires (art. 9 §1 point c) et exempte la déclaration
 * nutritionnelle (point l) dans les **deux** cas de vente de La Folie Coffee :
 * le frais non préemballé en boutique par l'art. 44 §1, les confiseries par
 * l'annexe V pt 19. Exiger les deux revenait à exiger ce que le règlement
 * n'exige pas — et c'est ce qui tenait 92 fiches en brouillon sans qu'une
 * ligne de code soit en cause.
 *
 * Ce que seul ce niveau prouve, et qu'aucun double ne peut prouver : les deux
 * moitiés vivent dans **deux tables**, la lecture les **recolle** depuis le bon
 * défaut, et c'est cet état recollé — pas celui qu'un agrégat porte en
 * mémoire — que la publication juge. Entre le domaine et la colonne, il y a
 * précisément l'endroit où ce chantier pouvait se tromper.
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

/** Ce que le défaut déclare quand il déclare. */
const DEFAULT_ALLERGEN = "UW";
/** Une valeur nutritionnelle, et une seule : elle ne doit jamais rien couvrir. */
const SOME_ENERGY = 410;
const OWN_SALT = 9;

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
  readonly allergens: readonly string[] | null;
}

interface ProductDetail {
  readonly status: string;
  readonly variants: readonly VariantDetail[];
}

async function detailOf(productId: string): Promise<ProductDetail> {
  const response = await staff().get(`${PRODUCTS}/${productId}`).expect(200);
  return jsonBody<ProductDetail>(response);
}

/**
 * Une fiche neuve et sa déclinaison par défaut — rien de déclaré.
 *
 * Le suffixe évite le `409` d'unicité entre deux cas : le nom d'une famille est
 * unique, et deux appels sans lui se refuseraient mutuellement.
 */
async function aProduct(suffix: string): Promise<{
  readonly productId: string;
  readonly variantId: string;
  readonly sku: string;
}> {
  const family = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: `Viennoiseries${suffix}` } });
  expect(family.status).toBe(201);
  const created = await staff()
    .post(PRODUCTS)
    .send({
      name: { fr: `Croissant${suffix}` },
      kind: "daily",
      categoryId: jsonBody<{ id: string }>(family).id,
    });
  expect(created.status).toBe(201);
  const productId = jsonBody<{ id: string }>(created).id;
  const [variant] = (await detailOf(productId)).variants;
  if (variant === undefined) {
    throw new Error("le produit est né sans déclinaison par défaut");
  }
  return { productId, variantId: variant.id, sku: variant.sku };
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

function publish(productId: string): ReturnType<ReturnType<typeof staff>["put"]> {
  return staff().put(`${PRODUCTS}/${productId}/publish`).send({});
}

describe("les allergènes suffisent, la nutrition ne remplace rien", () => {
  /**
   * 🔴 **Le cas 1, et il porte tout le lot.** Des allergènes déclarés, aucune
   * valeur nutritionnelle — le cas NORMAL du frais vendu en boutique — se
   * publie. C'est très exactement ce que l'ancienne formulation refusait.
   */
  it("publie une déclinaison qui déclare ses allergènes et AUCUNE valeur", async () => {
    const { productId, variantId } = await aProduct("-a");
    await saveAllergens(productId, variantId, { allergens: [DEFAULT_ALLERGEN] }).expect(200);

    expect((await publish(productId)).status).toBe(200);

    const detail = await detailOf(productId);
    expect(detail.status).toBe("published");
    // Et la table des valeurs est restée vide : rien n'a été fabriqué pour
    // satisfaire l'invariant.
    expect(
      await ctx.prisma.$queryRawUnsafe<{ variant_id: string }[]>(
        `SELECT variant_id FROM pim.nutrition_values WHERE variant_id = '${variantId}'`,
      ),
    ).toEqual([]);
  });

  /** « Aucun allergène » est une réponse : elle suffit, seule, à étiqueter. */
  it("publie sur « aucun allergène » sans le moindre tableau nutritionnel", async () => {
    const { productId, variantId } = await aProduct("-b");
    await saveAllergens(productId, variantId, { allergens: [] }).expect(200);

    expect((await publish(productId)).status).toBe(200);
    expect((await detailOf(productId)).status).toBe("published");
  });

  /**
   * 🔴 **Le cas 2 — l'état nommé de D3.** Des valeurs saisies, aucune
   * déclaration d'allergène : la fiche a l'air renseignée et ne l'est pas.
   * C'est le piège que le lot existe pour rendre bruyant, parce qu'un tableau
   * nutritionnel se copie d'un document tandis qu'une déclaration d'allergène
   * demande de regarder la recette.
   */
  it("refuse (409) des valeurs nutritionnelles sans déclaration d’allergène", async () => {
    const { productId, variantId, sku } = await aProduct("-c");
    await saveNutrition(productId, variantId, { energyKcal: SOME_ENERGY }).expect(200);

    const refus = await publish(productId);

    expect(refus.status).toBe(409);
    const body = jsonBody<{ code: string; message: string }>(refus);
    expect(body.code).toBe("catalogue.product.not_publishable");
    // Le SKU nommé : le back-office ne lit que ce message, et « ce produit
    // n'est pas publiable » n'aide personne devant six déclinaisons.
    expect(body.message).toContain(sku);
    // …et le geste de sortie, qui n'est PAS de remplir le tableau.
    expect(body.message).toContain("Allergènes");
    expect((await detailOf(productId)).status).toBe("draft");
  });

  /** Le refus se lève dès que la moitié manquante est écrite — et elle seule. */
  it("se publie dès que les allergènes sont déclarés, valeurs inchangées", async () => {
    const { productId, variantId } = await aProduct("-d");
    await saveNutrition(productId, variantId, { energyKcal: SOME_ENERGY }).expect(200);
    expect((await publish(productId)).status).toBe(409);

    await saveAllergens(productId, variantId, { allergens: [DEFAULT_ALLERGEN] }).expect(200);

    expect((await publish(productId)).status).toBe(200);
    expect((await detailOf(productId)).variants[0]?.allergens).toEqual([DEFAULT_ALLERGEN]);
  });
});

/**
 * 🔴 **La couverture se juge drapeau par drapeau** (D1 + D2 ensemble).
 *
 * Une déclinaison peut suivre les allergènes du défaut tout en portant ses
 * propres valeurs : c'est le cas courant d'un format différent de la même pâte.
 * Juger la couverture sur le drapeau nutritionnel l'aurait rendue impubliable
 * sur un geste qui ne touche pas à la sécurité du mangeur.
 */
describe("la couverture lit le drapeau des allergènes, pas celui des valeurs", () => {
  /** Le défaut déclare ses allergènes ; une seconde déclinaison naît alignée. */
  async function aProductWithSecondVariant(suffix: string): Promise<{
    readonly productId: string;
    readonly secondId: string;
    readonly secondSku: string;
  }> {
    const { productId, variantId } = await aProduct(suffix);
    await saveAllergens(productId, variantId, { allergens: [DEFAULT_ALLERGEN] }).expect(200);
    const added = await staff()
      .post(`${PRODUCTS}/${productId}/variants`)
      .send({ name: { fr: "Boîte de 220 g" }, options: { poids: "220 g" } });
    expect(added.status).toBe(201);
    const secondId = jsonBody<{ id: string }>(added).id;
    const second = (await detailOf(productId)).variants.find((v) => v.id === secondId);
    return { productId, secondId, secondSku: second?.sku ?? "" };
  }

  function align(
    productId: string,
    variantId: string,
    aspect: string,
    aligned: boolean,
  ): ReturnType<ReturnType<typeof staff>["put"]> {
    return staff()
      .put(`${PRODUCTS}/${productId}/variants/${variantId}/alignment`)
      .send({ aspect, aligned });
  }

  /**
   * 🔴 Le cas qui motive la découpe en deux drapeaux, vu depuis la
   * publication : se détacher des VALEURS ne retire rien à l'étiquetage.
   */
  it("publie une déclinaison détachée des valeurs mais alignée sur les allergènes", async () => {
    const { productId, secondId } = await aProductWithSecondVariant("-e");
    expect([200, 204]).toContain((await align(productId, secondId, "nutrition", false)).status);
    await saveNutrition(productId, secondId, { saltG: OWN_SALT }).expect(200);

    expect((await publish(productId)).status).toBe(200);

    const detail = await detailOf(productId);
    expect(detail.status).toBe("published");
    // Elle part au canal avec les allergènes du défaut, jamais avec `null` —
    // que le récepteur ne doit surtout pas lire « sans allergène ».
    expect(detail.variants.find((v) => v.id === secondId)?.allergens).toEqual([DEFAULT_ALLERGEN]);
  });

  /**
   * Et le symétrique : se détacher des ALLERGÈNES sans rien déclarer rend la
   * fiche impubliable, en nommant la déclinaison muette — pas le défaut, qui
   * est en règle.
   */
  it("refuse (409) une déclinaison détachée des allergènes qui n’a rien déclaré", async () => {
    const { productId, secondId, secondSku } = await aProductWithSecondVariant("-f");

    expect([200, 204]).toContain((await align(productId, secondId, "allergens", false)).status);

    const refus = await publish(productId);
    expect(refus.status).toBe(409);
    const { message } = jsonBody<{ message: string }>(refus);
    expect(message).toContain(secondSku);
    expect((await detailOf(productId)).status).toBe("draft");
  });

  /**
   * 🔴 **Ce que seule la base prouve.** Publier passe par `save()`, qui réécrit
   * toutes les déclinaisons : si l'adaptateur persistait l'instantané RÉSOLU,
   * la fiche du défaut atterrirait dans la colonne propre de la déclinaison
   * alignée (faute 0b/0d du plan). On s'en apercevrait au désalignement — trop
   * tard, et sur de la donnée d'étiquette.
   */
  it("ne recopie pas la fiche du défaut dans la colonne propre de l’alignée", async () => {
    const { productId, secondId } = await aProductWithSecondVariant("-g");

    expect((await publish(productId)).status).toBe(200);

    // Aucune ligne d'allergènes en propre : elle hérite à la LECTURE.
    expect(
      await ctx.prisma.$queryRawUnsafe<{ variant_id: string }[]>(
        `SELECT variant_id FROM pim.variant_allergens WHERE variant_id = '${secondId}'`,
      ),
    ).toEqual([]);
    // Et le désalignement lui rend donc « rien déclaré », pas la fiche d'autrui.
    expect([200, 204]).toContain((await align(productId, secondId, "allergens", false)).status);
    const detail = await detailOf(productId);
    expect(detail.variants.find((v) => v.id === secondId)?.allergens).toBeNull();
  });
});
