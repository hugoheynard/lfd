import type { E2eContext } from "./e2e-harness.js";
import { jsonBody } from "./e2e-harness.js";

/**
 * **Rendre une fiche activable**, pour les suites dont le sujet est ailleurs
 * (allergènes, cycle de vie, signature).
 *
 * Depuis le lot 2b de `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`,
 * activer exige une déclinaison complète : un prix, un taux pour CHAQUE
 * contexte de vente en service (b2b, à emporter, sur place). Ces suites ne
 * parlent ni de prix ni de TVA : elles posent ici le minimum — la famille
 * vendue aux pros seuls, un taux à chaque contexte, un prix public et un prix
 * pro HT saisi au défaut — par les vraies routes, sans écrire en base.
 * (La famille s'ouvrait aussi à chaque contexte dans la matrice des canaux,
 * pour le push ; matrice et push sont partis en X2/X4.) Les
 * allergènes restent l'affaire de chaque suite.
 */

type Staff = () => ReturnType<E2eContext["http"]>;

const PRODUCTS = "/pim/catalogue/products";
const CATEGORIES = "/pim/catalogue/categories";
const RATES = "/pim/vat-rates";
/** Le pourcentage est unique : la suite réutilise le taux s'il existe déjà. */
const FOOD_PERCENT = 5.5;
const PRICE_CENTS = 200;
/**
 * Le prix pro HT saisi : ce que le rapport d'origine (90 % de `PRICE_CENTS`,
 * au taux de `FOOD_PERCENT`) donnait, figé au retrait du rapport (lot R3,
 * 2026-10-27) — les suites gardent leurs chiffres.
 */
const PRO_PRICE_HT = "1.70616";

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

/** La famille vend aux pros, taxée dans chaque contexte en service ; le défaut a un prix. */
export async function makeActivatable(staff: Staff, productId: string): Promise<void> {
  const detail = jsonBody<Detail>(await staff().get(`${PRODUCTS}/${productId}`).expect(200));
  const category = `${CATEGORIES}/${detail.categoryId}`;
  const rateId = await foodRate(staff);
  await staff().put(`${category}/audience`).send({ audience: "pro" }).expect(200);
  await staff()
    .put(`${category}/vat`)
    .send({ vatByContext: { b2b: rateId, takeaway: rateId, eatIn: rateId } })
    .expect(200);
  const variant = detail.variants.find((entry) => entry.isDefault);
  await staff()
    .put(`${PRODUCTS}/${productId}/variants/${variant?.id ?? ""}/pricing`)
    .send({ priceCents: PRICE_CENTS, weightGrams: null, proPriceHt: PRO_PRICE_HT })
    .expect(200);
}
