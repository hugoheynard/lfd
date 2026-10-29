import { htMillicentsOf } from "@lfd/pim-contracts";

import { WEIGHED_GRAVLAX, WEIGHED_SMOKED } from "../src/dev/seeding/delivery-day.seed.js";
import { E2E_FAMILIES } from "./catalog-fixture.js";
import type { E2eContext } from "./e2e-harness.js";

/** Le taux alimentaire du catalogue des e2e (`catalog-fixture.ts`). */
const FOOD_VAT_RATE = 5.5;
/** La même date de réception que le catalogue des e2e : un push, une date. */
const RECEIVED_AT = new Date("2026-01-01T00:00:00.000Z");

/** Ce que le référentiel pousserait pour un article au poids du corpus. */
interface WeighedArticle {
  readonly sku: string;
  readonly name: string;
  /** Le prix pro HT au KILO, en millicentimes. */
  readonly proPerKgMillicents: number;
  /** L'étiquette TTC au KILO, en centimes. */
  readonly publicPerKgTtcCents: number;
  readonly weightStepGrams: number;
  readonly weightMinGrams: number;
}

/** Les deux saumons du corpus du référentiel (`prisma/seed-pim/catalogue.ts`), mêmes conditions. */
const WEIGHED_ARTICLES: readonly WeighedArticle[] = [
  {
    sku: WEIGHED_GRAVLAX,
    name: "Saumon gravlax maison",
    proPerKgMillicents: 5_200_000,
    publicPerKgTtcCents: 6_400,
    weightStepGrams: 50,
    weightMinGrams: 100,
  },
  {
    sku: WEIGHED_SMOKED,
    name: "Saumon fumé au bois de hêtre",
    proPerKgMillicents: 6_000_000,
    publicPerKgTtcCents: 7_200,
    weightStepGrams: 50,
    weightMinGrams: 100,
  },
];

/**
 * **Les articles au poids que le scénario de dev commande**, ajoutés au
 * catalogue des e2e (2026-10-29).
 *
 * Le catalogue partagé des suites (`catalog-fixture.ts`) ne vend qu'à la
 * pièce, et des dizaines de suites nomment ses articles : l'élargir pour
 * toutes aurait mêlé « le scénario commande au poids » et « le rayon salé a
 * deux articles de plus ». Seules les suites qui sèment le scénario les
 * posent, après `ctx.reset()` — comme un push du référentiel les poserait :
 * l'article et la trace de son tarif dans la même écriture.
 */
export async function seedWeighedArticles(ctx: E2eContext): Promise<void> {
  await ctx.prisma.catalogPriceHistory.createMany({
    data: WEIGHED_ARTICLES.map((article) => ({
      id: `cph_${article.sku}`,
      sku: `${article.sku}-1`,
      productSku: article.sku,
      priceMillicents: article.proPerKgMillicents,
      vatRatePercent: FOOD_VAT_RATE,
      source: "pim",
      recordedAt: RECEIVED_AT,
    })),
  });
  await ctx.prisma.catalogItem.createMany({
    data: WEIGHED_ARTICLES.map((article, index) => {
      const htMillicents = htMillicentsOf(article.publicPerKgTtcCents, FOOD_VAT_RATE);
      if (htMillicents === null) {
        throw new Error(`Article au poids « ${article.sku} » sans hors taxe.`);
      }
      return {
        sku: `${article.sku}-1`,
        productId: `prod_${article.sku}`,
        productSku: article.sku,
        name: article.name,
        kind: "simple",
        categoryId: E2E_FAMILIES.SAL.id,
        priceMillicents: article.proPerKgMillicents,
        vatRatePercent: FOOD_VAT_RATE,
        publicTtcCents: article.publicPerKgTtcCents,
        publicByContext: { takeaway: { vatRatePercent: FOOD_VAT_RATE, htMillicents } },
        saleUnit: "weight",
        weightStepGrams: article.weightStepGrams,
        weightMinGrams: article.weightMinGrams,
        isDefault: true,
        position: 1_000 + index,
        receivedAt: RECEIVED_AT,
      };
    }),
  });
}
