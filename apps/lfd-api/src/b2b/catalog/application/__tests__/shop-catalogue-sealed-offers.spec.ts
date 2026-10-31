import type { CatalogPricing } from "@lfd/contracts";

import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../platform/metrics/__tests__/metrics-doubles.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { FixedLineClassifications } from "../../../orders/domain/ports/__tests__/line-classification-doubles.js";
import { ownPricingParties } from "../../../pricing/application/__tests__/pricing-parties.doubles.js";
import { Pricer } from "../../../pricing/application/pricer.js";
import { PricingMaterialsLoader } from "../../../pricing/application/pricing-materials.loader.js";
import { CompanyMercuriale } from "../../../pricing/domain/entities/company-mercuriale.js";
import type { PromotionAdmission } from "../../../pricing/domain/entities/mercuriale-promotion-policy.js";
import { CompanyMercurialeReader } from "../../../pricing/domain/ports/company-mercuriale.reader.js";
import { VolumeCommitmentReader } from "../../../pricing/domain/ports/volume-commitment.reader.js";
import type { VolumeCommitment } from "../../../pricing/domain/volume-commitment.js";
import {
  noLinePromotionSupply,
  shelfPromotionOffers,
} from "../../../promotions/application/__tests__/promotion-supply.doubles.js";
import { livePromotion } from "../../../promotions/domain/__tests__/live-promotion.fixture.js";
import { CanonicalPriceHistoryReader } from "../../domain/ports/canonical-price-history.reader.js";
import { CatalogReader, type ResolvedCatalogItem } from "../../domain/ports/catalog.reader.js";
import { ShopOrderCutoffsReader } from "../../domain/ports/shop-order-cutoffs.reader.js";
import { InMemoryServedCompanies } from "../../infrastructure/in-memory-served-companies.js";
import { CatalogViewers } from "../catalog-viewers.service.js";
import { ShopCatalogueOffers } from "../shop-catalogue-offers.js";
import { ShopCataloguePricing } from "../shop-catalogue-pricing.service.js";
import { catalogItem, InMemoryCatalogOperations } from "./sale-operations-doubles.js";
import { GivenPricesPerKg } from "./price-per-kg-doubles.js";

/**
 * **Le rayon ne mentionne pas ce que la mercuriale exclut**
 * (`plan-la-mercuriale-decide.md`, § 8) : sur l'article que la mercuriale du
 * lecteur fixe, une promotion de panier que sa politique refuse ne se dit
 * pas ; sur ses autres articles, rien ne change. Monté sur la VRAIE porte de
 * prix, doublée à ses ports. Les dates ne sont comparées qu'à l'horloge figée.
 */

const NOW = new Date(Date.UTC(2030, 0, 1));
const COMPANY = "co_folie";
const NEGOTIATED = "VIE-012";
const FREE = "PAI-001";

class Sellable extends CatalogReader {
  listSellable(): Promise<ResolvedCatalogItem[]> {
    return Promise.resolve([catalogItem(NEGOTIATED), catalogItem(FREE)]);
  }
  findByShopSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.resolve(null);
  }
  listByShopSkus(): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
    return Promise.resolve(new Map());
  }
}

class OneMercuriale extends CompanyMercurialeReader {
  constructor(private readonly mercuriale: CompanyMercuriale) {
    super();
  }
  liveFor(companyId: string | null): Promise<CompanyMercuriale | null> {
    return Promise.resolve(companyId === COMPANY ? this.mercuriale : null);
  }
  liveAsOf(companyId: string | null): Promise<CompanyMercuriale | null> {
    return this.liveFor(companyId);
  }
  listFor(): Promise<readonly CompanyMercuriale[]> {
    return Promise.resolve([]);
  }
  liveEverywhere(): Promise<readonly CompanyMercuriale[]> {
    return Promise.resolve([]);
  }
}

class NoCommitments extends VolumeCommitmentReader {
  liveFor(): Promise<readonly VolumeCommitment[]> {
    return Promise.resolve([]);
  }
  liveAsOf(): Promise<readonly VolumeCommitment[]> {
    return Promise.resolve([]);
  }
}

class NoHistory extends CanonicalPriceHistoryReader {
  pricingAt(): Promise<ReadonlyMap<string, CatalogPricing>> {
    return Promise.resolve(new Map());
  }
  startsAt(): Promise<Date | null> {
    return Promise.resolve(null);
  }
}

class NoCutoffs extends ShopOrderCutoffsReader {
  list() {
    return Promise.resolve([]);
  }
}

const none = () => Promise.resolve([]);

function shelf(policy: PromotionAdmission): ShopCataloguePricing {
  const mercuriale = CompanyMercuriale.pose(
    "merc_1",
    {
      companyId: COMPANY,
      label: "Mercuriale",
      lines: [
        {
          sku: catalogItem(NEGOTIATED).sku,
          tiers: [{ minQuantity: 1, unitPriceMillicents: 150_000 }],
        },
      ],
      validFrom: new Date(0),
      validTo: null,
      promotionPolicy: policy,
    },
    "staff",
  );
  const offers = shelfPromotionOffers(
    [
      livePromotion({
        id: "retrait",
        fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
        validFrom: new Date(0),
      }),
    ],
    NOW,
  );
  const pricer = new Pricer(
    new PricingMaterialsLoader(
      { listArchived: none, inScopes: none, inScopesAt: none, candidatesFor: none, listAll: none },
      new OneMercuriale(mercuriale),
      { inScopes: none, inScopesAt: none, candidatesFor: none, listAll: none },
      { volumesFor: () => Promise.resolve(new Map()) },
      { inScopes: none, inScopesAt: none, candidatesFor: none, listAll: none },
      new NoCommitments(),
      {
        volumesFor: () => Promise.resolve(new Map<string, number>()),
        committedVolumesFor: () => Promise.resolve(new Map<string, number>()),
      },
      noLinePromotionSupply(),
    ),
    new FixedClock(NOW),
    new NoHistory(),
    ownPricingParties(),
    new RecordingTimings(),
    new FixedStopwatch(),
  );
  return new ShopCataloguePricing(
    new Sellable(),
    pricer,
    new InMemoryCatalogOperations(),
    new FixedClock(NOW),
    new NoCutoffs(),
    new GivenPricesPerKg(),
    new CatalogViewers(new InMemoryServedCompanies()),
    new ShopCatalogueOffers(offers, new FixedLineClassifications()),
  );
}

async function offeredSkus(policy: PromotionAdmission): Promise<string[]> {
  const view = await shelf(policy).priced(COMPANY, "registered", "fr");
  return view.items.filter((item) => item.fulfillmentOffers !== undefined).map((item) => item.sku);
}

describe("le rayon d'un client négocié", () => {
  it("« Aucune » : pas de mention sur l'article négocié, mention sur les autres", async () => {
    expect(await offeredSkus({ mode: "none", promotionIds: [] })).toEqual([catalogItem(FREE).sku]);
  });

  it("« Toutes » : mention partout", async () => {
    expect((await offeredSkus({ mode: "all", promotionIds: [] })).sort()).toEqual(
      [catalogItem(FREE).sku, catalogItem(NEGOTIATED).sku].sort(),
    );
  });

  it("« Au choix » : la promotion choisie se dit, une autre non", async () => {
    expect((await offeredSkus({ mode: "selected", promotionIds: ["retrait"] })).sort()).toEqual(
      [catalogItem(FREE).sku, catalogItem(NEGOTIATED).sku].sort(),
    );
    expect(await offeredSkus({ mode: "selected", promotionIds: ["autre"] })).toEqual([
      catalogItem(FREE).sku,
    ]);
  });
});
