import type { CatalogPricing, ContentLocale, ShopItemView } from "@lfd/contracts";

import { pickupsOpenToAll } from "../../../pickup-addresses/application/__tests__/pickup-address-doubles.js";
import { GivenDeliveryAvailability } from "../../../delivery-availability/domain/ports/__tests__/delivery-availability-doubles.js";
import { FixedLineClassifications } from "../../../orders/domain/ports/__tests__/line-classification-doubles.js";
import {
  FixedCompanyStatuses,
  linePromotionSupply,
  shelfPromotionOffers,
} from "../../../promotions/application/__tests__/promotion-supply.doubles.js";
import type { LivePromotion } from "../../../promotions/domain/live-promotion.js";
import { livePromotion } from "../../../promotions/domain/__tests__/live-promotion.fixture.js";
import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../platform/metrics/__tests__/metrics-doubles.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ownPricingParties } from "../../../pricing/application/__tests__/pricing-parties.doubles.js";
import { Pricer } from "../../../pricing/application/pricer.js";
import { PricingMaterialsLoader } from "../../../pricing/application/pricing-materials.loader.js";
import type { CompanyMercuriale } from "../../../pricing/domain/entities/company-mercuriale.js";
import { CompanyMercurialeReader } from "../../../pricing/domain/ports/company-mercuriale.reader.js";
import type { CustomerVolumeReader } from "../../../pricing/domain/ports/customer-volume.reader.js";
import type { PriceFloorReader } from "../../../pricing/domain/ports/price-floor.reader.js";
import type { PriceRuleReader } from "../../../pricing/domain/ports/price-rule.reader.js";
import type { SkuVolumeReader } from "../../../pricing/domain/ports/sku-volume.reader.js";
import { VolumeCommitmentReader } from "../../../pricing/domain/ports/volume-commitment.reader.js";
import type { VolumeLadderReader } from "../../../pricing/domain/ports/volume-ladder.reader.js";
import type { VolumeCommitment } from "../../../pricing/domain/volume-commitment.js";
import type { PriceRule } from "../../../pricing/domain/price-rule.js";
import { CanonicalPriceHistoryReader } from "../../domain/ports/canonical-price-history.reader.js";
import { CatalogReader, type ResolvedCatalogItem } from "../../domain/ports/catalog.reader.js";
import { ShopOrderCutoffsReader } from "../../domain/ports/shop-order-cutoffs.reader.js";
import { viewerAudience, type CatalogViewer } from "../../domain/catalog-viewer.js";
import { InMemoryServedCompanies } from "../../infrastructure/in-memory-served-companies.js";
import { CatalogViewers } from "../catalog-viewers.service.js";
import { ShopCatalogueOffers } from "../shop-catalogue-offers.js";
import { ShopCataloguePricing } from "../shop-catalogue-pricing.service.js";
import { catalogItem, InMemoryCatalogOperations } from "./sale-operations-doubles.js";
import { GivenPricesPerKg } from "./price-per-kg-doubles.js";

/**
 * **Le nom d'une baisse au rayon** (règle de Hugo, 2026-11-02) : celui de la
 * promotion « dans le prix affiché » qui l'a produite, réglé en admin, dans
 * l'audience et la langue du lecteur ; rien quand la baisse ne vient d'aucune
 * promotion. Montée sur la VRAIE porte de prix ; l'horloge est figée et les
 * fenêtres ne sont comparées qu'à elle.
 */

const NOW = new Date(0);
const PRO_COMPANY = "co_pro";

const CROISSANT = catalogItem("VIE-001", { unitPriceMillicents: 200_000 });

const NAMED: LivePromotion = livePromotion({
  id: "folie_coffee",
  validFrom: NOW,
  label: "Offre Folie Coffee",
  audienceLabels: {
    individuals: { fr: "Folie Coffee −20 %", en: "Folie Coffee −20%", it: null },
    pros: { fr: "Remise pro Folie Coffee", en: "Folie Coffee trade discount", it: null },
  },
});

/** Une mercuriale écrite à la main sur tout le catalogue : une baisse SANS nom. */
const NEGOTIATED: PriceRule = {
  id: "merc_1",
  stage: "mercuriale",
  scope: { type: "global", id: null },
  audience: { type: "all", id: null },
  minQuantity: null,
  validFrom: NOW,
  validTo: null,
  suspendedFrom: null,
  label: "Mercuriale",
  stacksOverMercuriale: false,
  nature: "replace",
  amountMillicents: 150_000,
};

class SellableCatalog extends CatalogReader {
  listSellable(viewer: CatalogViewer): Promise<ResolvedCatalogItem[]> {
    void viewerAudience(viewer);
    return Promise.resolve([CROISSANT]);
  }
  findByShopSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.reject(new Error("lecture inattendue"));
  }
  listByShopSkus(): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
    return Promise.reject(new Error("lecture inattendue"));
  }
}

class NoMercuriales extends CompanyMercurialeReader {
  liveFor(): Promise<CompanyMercuriale | null> {
    return Promise.resolve(null);
  }
  liveAsOf(): Promise<CompanyMercuriale | null> {
    return Promise.resolve(null);
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

class NoCutoffs extends ShopOrderCutoffsReader {
  list() {
    return Promise.resolve([]);
  }
}

const noPriceHistory = new (class extends CanonicalPriceHistoryReader {
  pricingAt(): Promise<ReadonlyMap<string, CatalogPricing>> {
    return Promise.resolve(new Map());
  }
  startsAt(): Promise<Date | null> {
    return Promise.resolve(null);
  }
})();

function rulesOf(rules: readonly PriceRule[]): PriceRuleReader {
  return {
    listArchived: () => Promise.resolve([]),
    inScopes: () => Promise.resolve([...rules]),
    inScopesAt: () => Promise.resolve([...rules]),
    candidatesFor: () => Promise.resolve([...rules]),
    listAll: () => Promise.resolve([...rules]),
  };
}

const noPriceFloors: PriceFloorReader = {
  inScopes: () => Promise.resolve([]),
  inScopesAt: () => Promise.resolve([]),
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};
const noSkuVolumes: SkuVolumeReader = { volumesFor: () => Promise.resolve(new Map()) };
const noVolumeLadders: VolumeLadderReader = {
  inScopes: () => Promise.resolve([]),
  inScopesAt: () => Promise.resolve([]),
  candidatesFor: () => Promise.resolve([]),
  listAll: () => Promise.resolve([]),
};
const noCustomerVolumes: CustomerVolumeReader = {
  volumesFor: () => Promise.resolve(new Map<string, number>()),
  committedVolumesFor: () => Promise.resolve(new Map<string, number>()),
};

function shelf(promotions: readonly LivePromotion[], rules: readonly PriceRule[] = []) {
  const statuses = new FixedCompanyStatuses(new Map([[PRO_COMPANY, "active"]]));
  const pricer = new Pricer(
    new PricingMaterialsLoader(
      rulesOf(rules),
      new NoMercuriales(),
      noPriceFloors,
      noSkuVolumes,
      noVolumeLadders,
      new NoCommitments(),
      noCustomerVolumes,
      linePromotionSupply(promotions, statuses),
    ),
    new FixedClock(NOW),
    noPriceHistory,
    ownPricingParties(),
    new RecordingTimings(),
    new FixedStopwatch(),
  );
  return new ShopCataloguePricing(
    new SellableCatalog(),
    pricer,
    new InMemoryCatalogOperations(),
    new FixedClock(NOW),
    new NoCutoffs(),
    new GivenPricesPerKg(),
    new CatalogViewers(new InMemoryServedCompanies()),
    new ShopCatalogueOffers(
      shelfPromotionOffers([], NOW),
      new FixedLineClassifications(),
      new GivenDeliveryAvailability(),
      pickupsOpenToAll("pickup_1"),
    ),
  );
}

async function itemFor(
  pricing: ShopCataloguePricing,
  companyId: string | null,
  language: ContentLocale = "fr",
): Promise<ShopItemView | undefined> {
  const view = await pricing.priced(
    companyId,
    companyId === null ? "guest" : "registered",
    language,
  );
  return view.items[0];
}

describe("le nom des promotions du prix affiché, au rayon", () => {
  it("un particulier lit le libellé Particuliers de la promotion", async () => {
    const item = await itemFor(shelf([NAMED]), null);

    expect(item?.catalogPriceMillicents).toBe(200_000);
    expect(item?.promotionNames).toEqual(["Folie Coffee −20 %"]);
  });

  it("un pro lit le libellé Pros, dans la langue du rayon", async () => {
    const item = await itemFor(shelf([NAMED]), PRO_COMPANY, "en");

    expect(item?.promotionNames).toEqual(["Folie Coffee trade discount"]);
  });

  it("sans libellé d'audience, le commun ; sans traduction, le français", async () => {
    const common = { ...NAMED, audienceLabels: { individuals: null, pros: null } };

    const item = await itemFor(shelf([common]), PRO_COMPANY, "it");

    expect(item?.promotionNames).toEqual(["Offre Folie Coffee"]);
  });

  it("🔴 une baisse venue d'une mercuriale seule n'a AUCUN nom : la clé est absente", async () => {
    const item = await itemFor(shelf([], [NEGOTIATED]), PRO_COMPANY);

    expect(item?.catalogPriceMillicents).toBe(200_000);
    expect(item).not.toHaveProperty("promotionNames");
  });

  it("sans promotion ni baisse, la clé est absente du fil", async () => {
    const item = await itemFor(shelf([]), null);

    expect(item).not.toHaveProperty("catalogPriceMillicents");
    expect(item).not.toHaveProperty("promotionNames");
  });
});
