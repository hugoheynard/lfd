import type { CatalogPricing } from "@lfd/contracts";

import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../platform/metrics/__tests__/metrics-doubles.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { FixedLineClassifications } from "../../../orders/domain/ports/__tests__/line-classification-doubles.js";
import { pickupsOpenToAll } from "../../../pickup-addresses/application/__tests__/pickup-address-doubles.js";
import { GivenDeliveryAvailability } from "../../../delivery-availability/domain/ports/__tests__/delivery-availability-doubles.js";
import { ownPricingParties } from "../../../pricing/application/__tests__/pricing-parties.doubles.js";
import { Pricer } from "../../../pricing/application/pricer.js";
import { PricingMaterialsLoader } from "../../../pricing/application/pricing-materials.loader.js";
import { CompanyMercuriale } from "../../../pricing/domain/entities/company-mercuriale.js";
import { CompanyMercurialeReader } from "../../../pricing/domain/ports/company-mercuriale.reader.js";
import { VolumeCommitmentReader } from "../../../pricing/domain/ports/volume-commitment.reader.js";
import type { VolumeCommitment } from "../../../pricing/domain/volume-commitment.js";
import {
  linePromotionSupply,
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
 * **Les articles suggérés valent ceux du rayon** (constat du 2026-11-02 : les
 * suggestions tarifaient le rayon entier pour en garder deux). `pricedItems`
 * doit rendre, pour un sous-ensemble, EXACTEMENT les vues du rayon complet
 * filtré — mercuriale, promotion de ligne, promotion d'acheminement, article
 * réservé à un autre compte, article au poids — et ne remettre au
 * tarificateur que ces articles. Les dates ne sont comparées qu'à l'horloge
 * figée.
 */

const NOW = new Date(Date.UTC(2030, 0, 1));
const COMPANY = "co_folie";
const NEGOTIATED = catalogItem("VIE-012");
const FREE = catalogItem("PAI-001");
const RESERVED = catalogItem("TAR-003", { reservation: "other" });
const WEIGHED = catalogItem("CHO-001", {
  saleUnit: "weight",
  weightStepGrams: 50,
  weightMinGrams: 100,
});
const UNASKED = catalogItem("CRO-009");
const SELLABLE = [NEGOTIATED, FREE, RESERVED, WEIGHED, UNASKED];

class Sellable extends CatalogReader {
  listSellable(): Promise<ResolvedCatalogItem[]> {
    return Promise.resolve([...SELLABLE]);
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

function negotiated(): CompanyMercuriale {
  return CompanyMercuriale.pose(
    "merc_1",
    {
      companyId: COMPANY,
      label: "Mercuriale",
      lines: [{ sku: NEGOTIATED.sku, tiers: [{ minQuantity: 1, unitPriceMillicents: 150_000 }] }],
      validFrom: new Date(0),
      validTo: null,
      promotionPolicy: { mode: "all", promotionIds: [] },
    },
    "staff",
  );
}

function pricerWith(timings: RecordingTimings): Pricer {
  return new Pricer(
    new PricingMaterialsLoader(
      { listArchived: none, inScopes: none, inScopesAt: none, candidatesFor: none, listAll: none },
      new OneMercuriale(negotiated()),
      { inScopes: none, inScopesAt: none, candidatesFor: none, listAll: none },
      { volumesFor: () => Promise.resolve(new Map()) },
      { inScopes: none, inScopesAt: none, candidatesFor: none, listAll: none },
      new NoCommitments(),
      {
        volumesFor: () => Promise.resolve(new Map<string, number>()),
        committedVolumesFor: () => Promise.resolve(new Map<string, number>()),
      },
      linePromotionSupply([livePromotion({ id: "ligne", validFrom: new Date(0) })]),
    ),
    new FixedClock(NOW),
    new NoHistory(),
    ownPricingParties(),
    timings,
    new FixedStopwatch(),
  );
}

function shelf(timings: RecordingTimings): ShopCataloguePricing {
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
  return new ShopCataloguePricing(
    new Sellable(),
    pricerWith(timings),
    new InMemoryCatalogOperations(),
    new FixedClock(NOW),
    new NoCutoffs(),
    new GivenPricesPerKg(
      new Map([
        [WEIGHED.sku, { proPricePerKgMillicents: 2_500_000, publicPricePerKgTtcCents: 2900 }],
      ]),
    ),
    new CatalogViewers(new InMemoryServedCompanies()),
    new ShopCatalogueOffers(
      offers,
      new FixedLineClassifications(),
      new GivenDeliveryAvailability(),
      pickupsOpenToAll(),
    ),
  );
}

const ASKED = [NEGOTIATED.sku, RESERVED.sku, WEIGHED.sku, "INCONNU-1"];

describe("pricedItems — les articles suggérés valent ceux du rayon", () => {
  it("un pro sous mercuriale : mêmes vues que le rayon reconnu filtré", async () => {
    const full = await shelf(new RecordingTimings()).priced(COMPANY, "registered", "fr");
    const timings = new RecordingTimings();
    const some = await shelf(timings).pricedItems(ASKED, { companyId: COMPANY }, "fr");

    expect(some).toEqual(full.items.filter((item) => ASKED.includes(item.sku)));
    // Le témoin : la mercuriale, la promotion et la règle du kilo ont bien joué.
    expect(some.map((item) => item.sku)).toEqual([NEGOTIATED.sku, RESERVED.sku, WEIGHED.sku]);
    expect(some).toMatchObject([
      // mercuriale 1,50 € puis −20 % de la promotion de ligne
      { unitPriceMillicents: 120_000, catalogPriceMillicents: 200_000 },
      { unitPriceMillicents: 160_000, orderable: false, lockedReason: "reserved_to_other_account" },
      // Vendu au poids : aucun kilo indicatif, exclu côté serveur depuis K1
      // (`saisir-un-prix.md`, § 2) — le prix servi EST au kilo.
      { unitPriceMillicents: 160_000, proPricePerKgMillicents: null },
    ]);
    expect(some.every((item) => item.fulfillmentOffers !== undefined)).toBe(true);
  });

  it.each(["public", "pro"] as const)(
    "sans société (%s) : mêmes vues que la vitrine sans société filtrée",
    async (audience) => {
      const full = await shelf(new RecordingTimings()).pricedWithoutCompany(audience, "fr");
      const some = await shelf(new RecordingTimings()).pricedItems(ASKED, { audience }, "fr");

      expect(some).toEqual(full.items.filter((item) => ASKED.includes(item.sku)));
    },
  );

  it("ne remet au tarificateur que les articles demandés, sous l'appelant `suggestions`", async () => {
    const whole = new RecordingTimings();
    await shelf(whole).priced(COMPANY, "registered", "fr");
    const timings = new RecordingTimings();
    await shelf(timings).pricedItems([FREE.sku], { companyId: COMPANY }, "fr");

    expect(whole.recorded.map(({ size, labels }) => [size, labels["caller"]])).toEqual([
      [SELLABLE.length, "shelf"],
    ]);
    expect(timings.recorded.map(({ size, labels }) => [size, labels["caller"]])).toEqual([
      [1, "suggestions"],
    ]);
  });

  it("aucun SKU demandé : aucun lot", async () => {
    const timings = new RecordingTimings();
    expect(await shelf(timings).pricedItems([], { audience: "public" })).toEqual([]);
    expect(timings.recorded).toEqual([]);
  });
});
