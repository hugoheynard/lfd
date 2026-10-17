import type { ProPricePolicy } from "@lfd/pim-contracts";

import { IncoProjector } from "../../../../allergens/domain/services/inco-projector.js";
import type {
  ProductRecord,
  VariantRecord,
} from "../../../../catalogue/product/domain/ports/product.repository.js";
import { projectProductFact } from "../catalog-facts.js";

/**
 * **La grille de parité du lot P** — ce que le fil vend sous `ratio_ttc`, sur
 * un éventail de prix, de taux et de rapports choisis pour tomber sur des
 * arrondis (un centime, 1,99 €, des taux à une décimale).
 *
 * Partagée entre la génération de l'empreinte d'AVANT le lot (relevée sur
 * `769d41e27`) et la suite qui la compare au code d'après.
 */
export const PRICES = [0, 1, 99, 199, 455, 1_200, 3_200, 99_999] as const;
export const RATES = [2.1, 5.5, 10, 20] as const;
export const RATIOS = [10_000, 9_000, 8_750, 9_333] as const;

const INCO = IncoProjector.from([], "fr");

function variantAt(rateIndex: number, price: number, entered: number | null): VariantRecord {
  return {
    id: `var_${rateIndex}_${price}`,
    sku: `PAR-${rateIndex}-${price}`,
    name: { fr: `Article ${price}` },
    options: {},
    isDefault: price === PRICES[0],
    isDiscontinued: false,
    position: PRICES.indexOf(price as (typeof PRICES)[number]),
    priceCents: price,
    weightGrams: null,
    proPriceMillicents: entered,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    allergenSheet: { declared: [], mayContain: [] },
    nutrition: null,
  };
}

function productAt(rateIndex: number, entered: (price: number) => number | null): ProductRecord {
  return {
    id: `prd_${rateIndex}`,
    sku: `PAR-${rateIndex}`,
    name: { fr: `Fiche ${rateIndex}` },
    slug: { fr: `fiche-${rateIndex}` },
    kind: "daily",
    categoryId: "cat_par",
    status: "published",
    channelOverride: null,
    operationOnly: false,
    requiresCold: false,
    audience: null,
    variants: PRICES.map((price) => variantAt(rateIndex, price, entered(price))),
    vatByContext: {},
  };
}

/**
 * `ratio|taux|prix` → `[HT poussé, HT émis, TTC public poussé]`.
 *
 * Le push est parti en X2 et sa projection en X4
 * (`documentation/catalogue/plan-sans-interrupteurs.md`) : les deux premières
 * colonnes de l'empreinte valaient le même nombre, et le fait seul les remplit
 * désormais — l'empreinte d'avant le lot P ne bouge pas.
 */
export type ParityGrid = Readonly<Record<string, readonly [number, number, number]>>;

/**
 * Projette toute la grille sous `ratio_ttc` par le fait (`projectProductFact`). `entered` fabrique le prix pro saisi
 * de chaque déclinaison : sous `ratio_ttc`, il ne doit rien changer.
 */
export function projectGrid(entered: (price: number) => number | null): ParityGrid {
  const grid: Record<string, readonly [number, number, number]> = {};
  for (const ratioBp of RATIOS) {
    const policy: ProPricePolicy = { method: "ratio_ttc", ratioBp };
    RATES.forEach((rate, rateIndex) => {
      const percents = { b2b: rate, takeaway: rate };
      const product = productAt(rateIndex, entered);
      const emitted = projectProductFact({
        product,
        family: {
          id: "cat_par",
          name: { fr: "Parité" },
          slug: { fr: "parite" },
          parentId: null,
          position: 0,
          isArchived: false,
          audience: "both",
          vatByContext: {},
        },
        familyPercents: percents,
        percents,
        // Les contextes de la grille : chacun a son taux, rien ne manque.
        rules: { activeContextKeys: Object.keys(percents), policy },
        inco: INCO,
        showcase: undefined,
      }).variants;
      for (const price of PRICES) {
        const sku = `PAR-${rateIndex}-${price}`;
        const fact = emitted.find((v) => v.sku === sku);
        grid[`${ratioBp}|${rate}|${price}`] = [
          fact?.priceMillicents ?? -1,
          fact?.priceMillicents ?? -1,
          fact?.publicTtcCents ?? -1,
        ];
      }
    });
  }
  return grid;
}
