import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { ProPricedArticle } from "../../../../pricing/domain/promotion-decimals.js";
import { PromotionNotFoundError } from "../../../domain/errors/promotion-errors.js";
import { PromotionBrowser } from "../../../domain/ports/promotion-browser.reader.js";
import { PromotionProPricesReader } from "../../../domain/ports/promotion-pro-prices.reader.js";
import { Promotion } from "../../../domain/promotion.js";
import type { PromotionEffect } from "../../../domain/promotion-effect.js";
import { FROM, lineTerms } from "../../../domain/__tests__/promotion-terms.fixture.js";
import { GetPromotionDecimalsHandler } from "../get-promotion-decimals.handler.js";
import { GetPromotionDecimalsQuery } from "../get-promotion-decimals.query.js";

class OneBrowser extends PromotionBrowser {
  constructor(private readonly promotion: Promotion) {
    super();
  }
  all(): Promise<readonly Promotion[]> {
    return Promise.resolve([this.promotion]);
  }
  naming(): Promise<readonly Promotion[]> {
    return Promise.resolve([]);
  }
  find(id: string): Promise<Promotion | null> {
    return Promise.resolve(id === this.promotion.id ? this.promotion : null);
  }
}

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
  const promotion = Promotion.pose("p_1", lineTerms({ effect }), "staff_hugo", FROM);
  const prices = new FixedProPrices(ARTICLES);
  const handler = new GetPromotionDecimalsHandler(
    new OneBrowser(promotion),
    prices,
    new FixedClock(FROM),
  );
  return { handler, prices };
}

describe("GetPromotionDecimalsHandler — avertir des décimales (§ 18.7)", () => {
  it("compte 0,93 € à −12 % et le montre en exemple, rangé par nom", async () => {
    const { handler } = scene({ kind: "percent_off", basisPoints: 1200 });
    const view = await handler.execute(new GetPromotionDecimalsQuery("p_1"));
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
    const { handler } = scene({ kind: "percent_off", basisPoints: 2000 });
    const view = await handler.execute(new GetPromotionDecimalsQuery("p_1"));
    expect(view.examples.map((example) => example.sku)).not.toContain("PAI-1");
  });

  it("rend zéro pour un montant fixe, sans lire le catalogue", async () => {
    const { handler, prices } = scene({ kind: "unit_amount_off", millicents: 12_000 });
    const view = await handler.execute(new GetPromotionDecimalsQuery("p_1"));
    expect(view).toEqual({ count: 0, examples: [] });
    expect(prices.reads).toBe(0);
  });

  it("refuse une promotion inconnue", async () => {
    const { handler } = scene({ kind: "percent_off", basisPoints: 1200 });
    await expect(handler.execute(new GetPromotionDecimalsQuery("p_absente"))).rejects.toThrow(
      PromotionNotFoundError,
    );
  });
});
