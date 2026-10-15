import type { E2eContext } from "./e2e-harness.js";
import { jsonBody } from "./e2e-harness.js";

/**
 * **Rendre une fiche activable**, pour les suites dont le sujet est ailleurs
 * (allergènes, cycle de vie, signature).
 *
 * Depuis le lot 2b de `documentation/pim/plan-catalogue-synchronise-par-audience.md`,
 * activer exige une déclinaison complète : un prix, un taux pour CHAQUE
 * contexte de vente en service (b2b, à emporter, sur place), et un rapport pro
 * réglé. Ces suites ne parlent ni de prix ni de TVA : elles posent ici le
 * minimum — la famille vendue aux pros seuls, ouverte à chaque contexte (un
 * comptoir pour les deux contextes de boutique), un taux à chacun, le rapport
 * pro, un prix au défaut — par les vraies routes, sans écrire en base. Les
 * allergènes restent l'affaire de chaque suite.
 */

type Staff = () => ReturnType<E2eContext["http"]>;

const PRODUCTS = "/pim/catalogue/products";
const CATEGORIES = "/pim/catalogue/categories";
const RATES = "/pim/vat-rates";
/** Le pourcentage est unique : la suite réutilise le taux s'il existe déjà. */
const FOOD_PERCENT = 5.5;
const PRICE_CENTS = 200;
const PRO_RATIO_BP = 9_000;

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
  // Un taux ne se règle que pour un contexte vendu : la famille s'ouvre à
  // chacun. `pos_b2b` n'est pas une boutique : c'est la ligne de la
  // plateforme dans la matrice, et elle existe sans avoir été créée.
  const shopId = await counterFor(staff, productId);
  await staff()
    .put(`${category}/channels`)
    .send([
      { pointOfSaleId: "pos_b2b", context: "b2b" },
      { pointOfSaleId: shopId, context: "takeaway" },
      { pointOfSaleId: shopId, context: "eatIn" },
    ])
    .expect(200);
  await staff()
    .put(`${category}/vat`)
    .send({ vatByContext: { b2b: rateId, takeaway: rateId, eatIn: rateId } })
    .expect(200);
  await staff()
    .put("/pim/accounting-rules/pro-price-ratio")
    .send({ ratioBp: PRO_RATIO_BP })
    .expect(200);
  const variant = detail.variants.find((entry) => entry.isDefault);
  await staff()
    .put(`${PRODUCTS}/${productId}/variants/${variant?.id ?? ""}/pricing`)
    .send({ priceCents: PRICE_CENTS, weightGrams: null })
    .expect(200);
}

/** Un comptoir qui vend à emporter et sur place — le lieu des deux contextes de boutique. */
async function counterFor(staff: Staff, productId: string): Promise<string> {
  const shop = await staff()
    .post("/pim/points-of-sale")
    .send({
      kind: "shop",
      label: `Comptoir ${productId}`,
      contexts: ["takeaway", "eatIn"],
      baseUrl: "",
      tableCount: 0,
    })
    .expect(201);
  return jsonBody<{ id: string }>(shop).id;
}
