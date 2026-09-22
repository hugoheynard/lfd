/**
 * E2E — **la fiche réglementaire s'aligne par MOITIÉ**, sur un vrai Postgres.
 *
 * Lot 4 de `documentation/pim/plan-separer-allergenes-et-nutrition.md` (D1).
 * Un drapeau unique faisait payer un désalignement sur l'autre moitié : se
 * détacher pour saisir ses propres valeurs nutritionnelles rendait du même
 * geste la déclinaison muette sur ses allergènes — donc impubliable, et pire,
 * projetée aux canaux avec `allergens: null` que personne ne doit lire
 * « sans allergène ».
 *
 * Ce que seul ce niveau prouve : la colonne neuve existe, la LECTURE recolle
 * les deux moitiés depuis le bon défaut, et le `CHECK` refuse à la déclinaison
 * par défaut de se nourrir d'elle-même. Un test d'agrégat dit ce que le domaine
 * a décidé ; l'écart vit entre le domaine et la colonne.
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

/** Ce que le DÉFAUT déclare — les deux moitiés, traces comprises. */
const DEFAULT_ALLERGEN = "UW";
const DEFAULT_TRACE = "AM";
const DEFAULT_SALT = 2;
/** Ce que la seconde déclinaison saisit une fois détachée. */
const OWN_SALT = 9;
const OWN_ALLERGEN = "AP";

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
  readonly regulatoryFollowsDefault: boolean;
  readonly nutritionFollowsDefault: boolean;
  readonly allergenSheet: {
    readonly declared: readonly string[];
    readonly mayContain: readonly string[];
  } | null;
  readonly nutrition: {
    readonly saltG: number | null;
  } | null;
}

async function variantsOf(productId: string): Promise<readonly VariantDetail[]> {
  const detail = await staff().get(`${PRODUCTS}/${productId}`).expect(200);
  return jsonBody<{ variants: VariantDetail[] }>(detail).variants;
}

async function secondOf(productId: string): Promise<VariantDetail> {
  const found = (await variantsOf(productId)).find((variant) => !variant.isDefault);
  if (found === undefined) {
    throw new Error("la seconde déclinaison n'a pas été relue");
  }
  return found;
}

/**
 * Une fiche dont le DÉFAUT déclare ses deux moitiés, plus une seconde
 * déclinaison née alignée sur les deux.
 *
 * Le suffixe évite le `409` d'unicité entre deux cas : le nom d'une famille est
 * unique, et deux appels sans lui se refuseraient mutuellement.
 */
async function aProductWithTwoVariants(suffix: string): Promise<{
  readonly productId: string;
  readonly variantId: string;
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

  const [defaultVariant] = await variantsOf(productId);
  const defaultId = defaultVariant?.id ?? "";
  await staff()
    .put(`${PRODUCTS}/${productId}/variants/${defaultId}/allergens`)
    .send({ allergens: [DEFAULT_ALLERGEN], mayContain: [DEFAULT_TRACE] })
    .expect(200);
  await staff()
    .put(`${PRODUCTS}/${productId}/variants/${defaultId}/nutrition`)
    .send({ saltG: DEFAULT_SALT })
    .expect(200);

  const added = await staff()
    .post(`${PRODUCTS}/${productId}/variants`)
    .send({ name: { fr: "Boîte de 220 g" }, options: { poids: "220 g" } });
  expect(added.status).toBe(201);

  return { productId, variantId: jsonBody<{ id: string }>(added).id };
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

describe("les deux moitiés se détachent séparément", () => {
  it("naît alignée sur les deux, et rend la fiche du défaut", async () => {
    const { productId } = await aProductWithTwoVariants("-a");

    const second = await secondOf(productId);
    expect(second).toMatchObject({
      regulatoryFollowsDefault: true,
      nutritionFollowsDefault: true,
      allergenSheet: { declared: [DEFAULT_ALLERGEN], mayContain: [DEFAULT_TRACE] },
    });
    expect(second.nutrition).toMatchObject({ saltG: DEFAULT_SALT });
  });

  /**
   * 🔴 Le cas qui motive le lot. Saisir ses propres valeurs ne doit pas rendre
   * la déclinaison muette sur ses allergènes.
   */
  it("saisir ses propres valeurs ne détache pas les allergènes", async () => {
    const { productId, variantId } = await aProductWithTwoVariants("-b");

    expect([200, 204]).toContain((await align(productId, variantId, "nutrition", false)).status);
    await staff()
      .put(`${PRODUCTS}/${productId}/variants/${variantId}/nutrition`)
      .send({ saltG: OWN_SALT })
      .expect(200);

    const second = await secondOf(productId);
    expect(second).toMatchObject({
      regulatoryFollowsDefault: true,
      nutritionFollowsDefault: false,
      allergenSheet: { declared: [DEFAULT_ALLERGEN] },
    });
    expect(second.nutrition).toMatchObject({ saltG: OWN_SALT });
    // 🔴 Les traces suivent les ALLERGÈNES, jamais les valeurs : une trace est
    // une déclaration de sécurité (plan §5). Depuis le lot 7 elles voyagent
    // dans le même objet qu'eux, et ne peuvent plus partir du mauvais côté.
    expect(second.allergenSheet?.mayContain).toEqual([DEFAULT_TRACE]);
  });

  it("déclarer ses propres allergènes ne détache pas les valeurs", async () => {
    const { productId, variantId } = await aProductWithTwoVariants("-c");

    expect([200, 204]).toContain((await align(productId, variantId, "allergens", false)).status);
    await staff()
      .put(`${PRODUCTS}/${productId}/variants/${variantId}/allergens`)
      .send({ allergens: [OWN_ALLERGEN] })
      .expect(200);

    const second = await secondOf(productId);
    expect(second).toMatchObject({
      regulatoryFollowsDefault: false,
      nutritionFollowsDefault: true,
      allergenSheet: { declared: [OWN_ALLERGEN], mayContain: [] },
    });
    // Les valeurs restent celles du défaut : l'autre drapeau n'a pas bougé.
    expect(second.nutrition).toMatchObject({ saltG: DEFAULT_SALT });
  });

  /**
   * `"regulatory"` est l'ancienne section entière. Aucun écran ne l'envoie plus,
   * et elle reste acceptée tant que la version du back-office en ligne n'a pas
   * basculé ; elle vise le drapeau des allergènes — la colonne qu'elle a
   * toujours désignée (§6d).
   */
  it("accepte encore l'ancienne section « regulatory », côté allergènes", async () => {
    const { productId, variantId } = await aProductWithTwoVariants("-d");

    expect([200, 204]).toContain((await align(productId, variantId, "regulatory", false)).status);

    expect(await secondOf(productId)).toMatchObject({
      regulatoryFollowsDefault: false,
      nutritionFollowsDefault: true,
    });
  });
});

/**
 * 🔴 **Ce que seule la base refuse.** L'agrégat refuse déjà que le défaut se
 * suive lui-même, mais une écriture qui le contournerait — un script, une
 * reprise, un handler à venir — rendrait sa fiche jamais déclarée et jamais
 * refusée. La contrainte est le dernier mot, et c'est elle qu'on éprouve ici.
 */
describe("le CHECK refuse que le défaut se suive lui-même", () => {
  it("refuse `nutrition_follows_default` sur la déclinaison par défaut", async () => {
    const { productId } = await aProductWithTwoVariants("-e");
    const defaultVariant = (await variantsOf(productId)).find((variant) => variant.isDefault);

    await expect(
      ctx.prisma.$executeRawUnsafe(
        `UPDATE pim.product_variant
           SET nutrition_follows_default = true
           WHERE id = '${defaultVariant?.id ?? ""}'`,
      ),
    ).rejects.toThrow(/product_variant_default_feeds_itself/);
  });

  /** Et il laisse passer une déclinaison qui n'est PAS celle par défaut. */
  it("laisse passer la seconde déclinaison", async () => {
    const { productId, variantId } = await aProductWithTwoVariants("-f");

    await expect(
      ctx.prisma.$executeRawUnsafe(
        `UPDATE pim.product_variant
           SET nutrition_follows_default = true
           WHERE id = '${variantId}'`,
      ),
    ).resolves.toBe(1);

    expect(await secondOf(productId)).toMatchObject({ nutritionFollowsDefault: true });
  });
});
