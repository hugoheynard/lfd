import type { E2eContext } from "./e2e-harness.js";
import { jsonBody } from "./e2e-harness.js";

/**
 * **Rendre une fiche activable**, pour les suites dont le sujet est ailleurs
 * (allergènes, cycle de vie, signature).
 *
 * Depuis le lot 1 de `documentation/pim/plan-catalogue-synchronise-par-audience.md`,
 * activer exige un prix et un taux par clientèle de l'audience effective. Ces
 * suites ne parlent ni de prix ni de TVA : elles posent ici le minimum — la
 * famille vendue aux pros seuls, sa ligne `pos_b2b`/`b2b`, un taux à ce
 * contexte, un prix au défaut — par les vraies routes, sans écrire en base.
 */

type Staff = () => ReturnType<E2eContext["http"]>;

const PRODUCTS = "/pim/catalogue/products";
const CATEGORIES = "/pim/catalogue/categories";
const RATES = "/pim/vat-rates";
/** Le pourcentage est unique : la suite réutilise le taux s'il existe déjà. */
const FOOD_PERCENT = 5.5;
const PRICE_CENTS = 200;

interface Detail {
  readonly categoryId: string;
  readonly variants: readonly { readonly id: string; readonly isDefault: boolean }[];
}

async function foodRate(staff: Staff): Promise<string> {
  const rates = jsonBody<{ id: string; percent: number }[]>(await staff().get(RATES).expect(200));
  const existing = rates.find((rate) => rate.percent === FOOD_PERCENT);
  if (existing !== undefined) {
    return existing.id;
  }
  return jsonBody<{ id: string }>(
    await staff().post(RATES).send({ name: "Alimentaire", percent: FOOD_PERCENT }).expect(201),
  ).id;
}

/** La famille vend aux pros, en ligne, au taux alimentaire ; le défaut a un prix. */
export async function makeActivatable(staff: Staff, productId: string): Promise<void> {
  const detail = jsonBody<Detail>(await staff().get(`${PRODUCTS}/${productId}`).expect(200));
  const category = `${CATEGORIES}/${detail.categoryId}`;
  const rateId = await foodRate(staff);
  await staff().put(`${category}/audience`).send({ audience: "pro" }).expect(200);
  // `pos_b2b` n'est pas une boutique : c'est la ligne de la plateforme dans la
  // matrice, et elle existe sans avoir été créée.
  await staff()
    .put(`${category}/channels`)
    .send([{ pointOfSaleId: "pos_b2b", context: "b2b" }])
    .expect(200);
  await staff()
    .put(`${category}/vat`)
    .send({ vatByContext: { b2b: rateId } })
    .expect(200);
  const variant = detail.variants.find((entry) => entry.isDefault);
  await staff()
    .put(`${PRODUCTS}/${productId}/variants/${variant?.id ?? ""}/pricing`)
    .send({ priceCents: PRICE_CENTS, weightGrams: null })
    .expect(200);
}
