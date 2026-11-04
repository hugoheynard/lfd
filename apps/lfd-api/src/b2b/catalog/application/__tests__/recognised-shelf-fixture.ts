import type { CatalogPricing } from "@lfd/contracts";

import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../platform/metrics/__tests__/metrics-doubles.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { GivenDeliveryAvailability } from "../../../delivery-availability/domain/ports/__tests__/delivery-availability-doubles.js";
import { FixedLineClassifications } from "../../../orders/domain/ports/__tests__/line-classification-doubles.js";
import { pickupsOpenToAll } from "../../../pickup-addresses/application/__tests__/pickup-address-doubles.js";
import { ownPricingParties } from "../../../pricing/application/__tests__/pricing-parties.doubles.js";
import { Pricer } from "../../../pricing/application/pricer.js";
import { PricingMaterialsLoader } from "../../../pricing/application/pricing-materials.loader.js";
import { CompanyMercuriale } from "../../../pricing/domain/entities/company-mercuriale.js";
import { CompanyMercurialeReader } from "../../../pricing/domain/ports/company-mercuriale.reader.js";
import { VolumeCommitmentReader } from "../../../pricing/domain/ports/volume-commitment.reader.js";
import type { VolumeCommitment } from "../../../pricing/domain/volume-commitment.js";
import {
  noLinePromotionSupply,
  shelfPromotionOffers,
} from "../../../promotions/application/__tests__/promotion-supply.doubles.js";
import { CanonicalPriceHistoryReader } from "../../domain/ports/canonical-price-history.reader.js";
import { CatalogReader, type ResolvedCatalogItem } from "../../domain/ports/catalog.reader.js";
import { ShopOrderCutoffsReader } from "../../domain/ports/shop-order-cutoffs.reader.js";
import { InMemoryServedCompanies } from "../../infrastructure/in-memory-served-companies.js";
import { CatalogViewers } from "../catalog-viewers.service.js";
import { ShopCatalogueOffers } from "../shop-catalogue-offers.js";
import { ShopCataloguePricing } from "../shop-catalogue-pricing.service.js";
import { GivenPricesPerKg } from "./price-per-kg-doubles.js";
import { catalogItem, InMemoryCatalogOperations } from "./sale-operations-doubles.js";

/**
 * Le VRAI calcul du rayon, doublé à ses ports — pour éprouver le cache contre
 * ce qu'il garde, et non contre une fiction. Les dates ne sont comparées qu'à
 * l'horloge figée.
 */
export const SHELF_NOW = new Date(Date.UTC(2030, 0, 1));

/** Une société sous mercuriale, son site (principal actif), un site d'un principal en attente. */
export const HEAD = "co_head";
export const SITE = "co_site";
export const OTHER = "co_other";
export const PENDING_HEAD = "co_pending_head";
export const SITE_OF_PENDING = "co_site_of_pending";

const NEGOTIATED = catalogItem("VIE-012");
const FREE = catalogItem("PAI-001");

/** Le catalogue, qui compte ses lectures : l'unité du budget. */
export class CountingCatalog extends CatalogReader {
  reads = 0;

  listSellable(): Promise<ResolvedCatalogItem[]> {
    this.reads += 1;
    return Promise.resolve([NEGOTIATED, FREE]);
  }
  findByShopSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.resolve(null);
  }
  listByShopSkus(): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
    return Promise.resolve(new Map());
  }
}

class HeadMercuriale extends CompanyMercurialeReader {
  liveFor(companyId: string | null): Promise<CompanyMercuriale | null> {
    return Promise.resolve(companyId === HEAD ? negotiated() : null);
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

function negotiated(): CompanyMercuriale {
  return CompanyMercuriale.pose(
    "merc_head",
    {
      companyId: HEAD,
      label: "Mercuriale",
      lines: [{ sku: NEGOTIATED.sku, tiers: [{ minQuantity: 1, unitPriceMillicents: 150_000 }] }],
      validFrom: new Date(0),
      validTo: null,
      promotionPolicy: { mode: "all", promotionIds: [] },
    },
    "staff",
  );
}

function pricer(): Pricer {
  return new Pricer(
    new PricingMaterialsLoader(
      { listArchived: none, inScopes: none, inScopesAt: none, candidatesFor: none, listAll: none },
      new HeadMercuriale(),
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
    new FixedClock(SHELF_NOW),
    new NoHistory(),
    ownPricingParties(),
    new RecordingTimings(),
    new FixedStopwatch(),
  );
}

/** Le calcul du rayon, et ses compteurs de lectures. */
export interface ShelfComputation {
  readonly pricing: ShopCataloguePricing;
  readonly catalog: CountingCatalog;
  readonly companies: InMemoryServedCompanies;
}

export function shelfComputation(): ShelfComputation {
  const catalog = new CountingCatalog();
  const companies = new InMemoryServedCompanies(
    new Map([[PENDING_HEAD, "pending"]]),
    new Map([[SITE, HEAD]]),
    new Map([[SITE_OF_PENDING, PENDING_HEAD]]),
  );
  const pricing = new ShopCataloguePricing(
    catalog,
    pricer(),
    new InMemoryCatalogOperations(),
    new FixedClock(SHELF_NOW),
    new NoCutoffs(),
    new GivenPricesPerKg(new Map()),
    new CatalogViewers(companies),
    new ShopCatalogueOffers(
      shelfPromotionOffers([], SHELF_NOW),
      new FixedLineClassifications(),
      new GivenDeliveryAvailability(),
      pickupsOpenToAll(),
    ),
  );
  return { pricing, catalog, companies };
}
