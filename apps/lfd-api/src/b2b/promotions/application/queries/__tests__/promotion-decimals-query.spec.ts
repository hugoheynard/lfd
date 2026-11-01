import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { ProPricedArticle } from "../../../../pricing/domain/promotion-decimals.js";
import { PromotionBlankTextError } from "../../../domain/errors/promotion-errors.js";
import { PromotionProPricesReader } from "../../../domain/ports/promotion-pro-prices.reader.js";
import type { PromotionEffect } from "../../../domain/promotion-effect.js";
import { FROM, lineTerms } from "../../../domain/__tests__/promotion-terms.fixture.js";
import { GetPromotionDecimalsHandler } from "../get-promotion-decimals.handler.js";
import { GetPromotionDecimalsQuery } from "../get-promotion-decimals.query.js";

class FixedProPrices extends PromotionProPricesReader {
  reads = 0;
  constructor(private readonly articles: readonly ProPricedArticle[]) {
    super();
  }
  proArticles(): Promise<readonly ProPricedArticle[]> {
    this.reads += 1;
    return Promise.resolve(this.articles);
  }
}

function article(sku: string, name: string, priceMillicents: number): ProPricedArticle {
  return { sku, productSku: sku, name, categoryPath: [], saleUnit: "piece", priceMillicents };
}

const ARTICLES = [
  article("PAI-1", "Pain", 100_000),
  article("CRO-1", "Croissant", 93_000),
  article("CHO-1", "Chocolatine", 107_000),
];

function scene(effect: PromotionEffect) {
  const prices = new FixedProPrices(ARTICLES);
  const handler = new GetPromotionDecimalsHandler(prices, new FixedClock(FROM));
  return { handler, prices, query: new GetPromotionDecimalsQuery(lineTerms({ effect })) };
}

describe("GetPromotionDecimalsHandler — avertir des décimales (§ 18.7)", () => {
  it("compte 0,93 € à −12 % et le montre en exemple, rangé par nom", async () => {
    const { handler, query } = scene({ kind: "percent_off", basisPoints: 1200 });
    const view = await handler.execute(query);
    // 1,00 € → 0,88 € (au centime) ; 0,93 € → 0,8184 € ; 1,07 € → 0,9416 €.
    expect(view).toEqual({
      count: 2,
      examples: [
        { sku: "CHO-1", name: "Chocolatine", priceMillicents: 107_000, netMillicents: 94_160 },
        { sku: "CRO-1", name: "Croissant", priceMillicents: 93_000, netMillicents: 81_840 },
      ],
    });
  });

  it("ne compte pas 1,00 € à −20 %", async () => {
    const { handler, query } = scene({ kind: "percent_off", basisPoints: 2000 });
    const view = await handler.execute(query);
    expect(view.examples.map((example) => example.sku)).not.toContain("PAI-1");
  });

  it("rend zéro pour un montant fixe, sans lire le catalogue", async () => {
    const { handler, prices, query } = scene({ kind: "unit_amount_off", millicents: 12_000 });
    const view = await handler.execute(query);
    expect(view).toEqual({ count: 0, examples: [] });
    expect(prices.reads).toBe(0);
  });

  it("refuse des termes que l'agrégat refuserait, sans lire le catalogue", async () => {
    const { handler, prices } = scene({ kind: "percent_off", basisPoints: 1200 });
    const blank = new GetPromotionDecimalsQuery(lineTerms({ internalName: " " }));
    await expect(handler.execute(blank)).rejects.toThrow(PromotionBlankTextError);
    expect(prices.reads).toBe(0);
  });

  it("avertit aussi d'une promotion qui ne commence que dans un mois", async () => {
    // Cas limite : l'avertissement sert surtout AVANT le début ; une fenêtre
    // future ne doit pas le taire.
    const { handler } = scene({ kind: "percent_off", basisPoints: 1200 });
    const later = new Date(FROM.getTime() + 30 * 86_400_000);
    const view = await handler.execute(
      new GetPromotionDecimalsQuery(
        lineTerms({ effect: { kind: "percent_off", basisPoints: 1200 }, validFrom: later }),
      ),
    );
    expect(view.count).toBe(2);
  });
});
