import type { CatalogPricing } from "@lfd/contracts";

import { Clock } from "../../../../../platform/time/clock.js";
import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../../platform/metrics/__tests__/metrics-doubles.js";
import { CatalogViewers } from "../../../../catalog/application/catalog-viewers.service.js";
import { CanonicalPriceHistoryReader } from "../../../../catalog/domain/ports/canonical-price-history.reader.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { InMemoryServedCompanies } from "../../../../catalog/infrastructure/in-memory-served-companies.js";
import { ownPricingParties } from "../../../../pricing/application/__tests__/pricing-parties.doubles.js";
import { Pricer } from "../../../../pricing/application/pricer.js";
import { PricingMaterialsLoader } from "../../../../pricing/application/pricing-materials.loader.js";
import { noLinePromotionSupply } from "../../../../promotions/application/__tests__/promotion-supply.doubles.js";
import { DatedPublicPriceUnsupportedError } from "../../../domain/errors/dated-public-price.error.js";
import { OrderLinePricing } from "../order-line-pricing.service.js";
import { catalogItem, PRICED_AT } from "./shop-cart-quoting.doubles.js";

/**
 * **L'instant d'une lecture « maintenant »**, hors requête.
 *
 * Régression (2026-10-30) : hors d'une requête HTTP, `SystemClock` rend le mur
 * à chaque appel. `OrderLinePricing` lisait l'horloge, la porte du prix la
 * relisait une milliseconde plus tard, jugeait la question « relecture », et
 * rescellait l'article au prix de l'historique canonique — le prix PRO. Un
 * invité passé par un job ou un handler appelé en direct payait le prix pro.
 */

/** Le mur hors requête : chaque lecture avance d'une milliseconde. */
class TickingClock extends Clock {
  private reads = 0;
  now(): Date {
    this.reads += 1;
    return new Date(PRICED_AT.getTime() + this.reads);
  }
}

const PUBLIC_PRICE = 200_000;
const PRO_PRICE_IN_HISTORY = 150_000;

/** Un historique qui ne connaît que le prix pro — et compte qui l'interroge. */
class ProOnlyHistory extends CanonicalPriceHistoryReader {
  asked = 0;
  pricingAt(): Promise<ReadonlyMap<string, CatalogPricing>> {
    this.asked += 1;
    return Promise.resolve(
      new Map([
        [
          "VIE-001",
          { sku: "VIE-001", unitPriceMillicents: PRO_PRICE_IN_HISTORY, vatRatePercent: 0 },
        ],
      ]),
    );
  }
  startsAt(): Promise<Date | null> {
    return Promise.resolve(new Date(0));
  }
}

const empty = () => Promise.resolve([]);

function pricingWith(history: CanonicalPriceHistoryReader): OrderLinePricing {
  const loader = new PricingMaterialsLoader(
    {
      listArchived: empty,
      inScopes: empty,
      inScopesAt: empty,
      candidatesFor: empty,
      listAll: empty,
    },
    {
      liveFor: () => Promise.resolve(null),
      liveAsOf: () => Promise.resolve(null),
      listFor: empty,
      liveEverywhere: empty,
    },
    { inScopes: empty, inScopesAt: empty, candidatesFor: empty, listAll: empty },
    { volumesFor: () => Promise.resolve(new Map()) },
    { inScopes: empty, inScopesAt: empty, candidatesFor: empty, listAll: empty },
    { liveFor: empty, liveAsOf: empty },
    {
      volumesFor: () => Promise.resolve(new Map<string, number>()),
      committedVolumesFor: () => Promise.resolve(new Map<string, number>()),
    },
    noLinePromotionSupply(),
  );
  return new OrderLinePricing(
    new InMemoryProductCatalog([catalogItem("VIE-001", "Croissant", PUBLIC_PRICE, 0)]),
    new Pricer(
      loader,
      new TickingClock(),
      history,
      ownPricingParties(),
      new RecordingTimings(),
      new FixedStopwatch(),
    ),
    new CatalogViewers(new InMemoryServedCompanies()),
  );
}

const GUEST = { companyId: null, buyerKind: "guest" } as const;

describe("OrderLinePricing — une lecture « maintenant » hors requête", () => {
  it("🔴 reste au présent quand l'horloge avance entre deux lectures : prix public, sans historique", async () => {
    const history = new ProOnlyHistory();

    const [line] = await pricingWith(history).resolve(
      [{ sku: "VIE-001", quantity: 2 }],
      GUEST,
      "checkout",
    );

    expect(line?.line.unitPriceMillicents).toBe(PUBLIC_PRICE);
    expect(history.asked).toBe(0);
  });

  it("🔴 refuse une lecture DATÉE au public plutôt que de la sceller au prix pro", async () => {
    const history = new ProOnlyHistory();

    await expect(
      pricingWith(history).resolve(
        [{ sku: "VIE-001", quantity: 2 }],
        GUEST,
        "checkout",
        new Date(PRICED_AT.getTime() - 1),
      ),
    ).rejects.toBeInstanceOf(DatedPublicPriceUnsupportedError);
    expect(history.asked).toBe(0);
  });
});
