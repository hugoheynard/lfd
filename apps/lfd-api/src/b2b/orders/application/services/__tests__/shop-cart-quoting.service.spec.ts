import {
  type AudiencePickupDiscount,
  type CatalogPricing,
  DEFAULT_DELIVERY_AVAILABILITY,
  type DeliveryAvailabilityView,
  type DeliveryZoneView,
  type PickupAddressView,
} from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../../platform/metrics/__tests__/metrics-doubles.js";
import { noSaleOperations } from "../../../../catalog/application/__tests__/sale-operations-doubles.js";
import { PAINS } from "../../../../catalog/domain/__tests__/families.fixture.js";
import { CanonicalPriceHistoryReader } from "../../../../catalog/domain/ports/canonical-price-history.reader.js";
import type { UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { DeliveryAvailabilityReader } from "../../../../delivery-availability/domain/ports/delivery-availability.reader.js";
import { DeliveryZoneRepository } from "../../../../delivery-zones/domain/delivery-zone.repository.js";
import { PickupAddressRepository } from "../../../../pickup-addresses/domain/pickup-address.repository.js";
import { ownPricingParties } from "../../../../pricing/application/__tests__/pricing-parties.doubles.js";
import { Pricer } from "../../../../pricing/application/pricer.js";
import { PricingMaterialsLoader } from "../../../../pricing/application/pricing-materials.loader.js";
import type { OrderVoucher } from "../../../domain/entities/order.js";
import { FixedLineClassifications } from "../../../domain/ports/__tests__/line-classification-doubles.js";
import {
  CompanyStatusReader,
  type OrderCompanyStatus,
} from "../../../domain/ports/company-status.reader.js";
import { LoyaltyVoucherQuoteReader } from "../../../domain/ports/loyalty-voucher-quote.reader.js";
import { PreferredPickupReader } from "../../../domain/ports/preferred-pickup.reader.js";
import { FixedDeliveryVat } from "../../commands/__tests__/fixed-delivery-vat.js";
import { CartAdjustments } from "../cart-adjustments.service.js";
import { CustomerAudiences } from "../customer-audiences.service.js";
import { OrderLinePricing } from "../order-line-pricing.service.js";
import { OrderOperations } from "../order-operations.service.js";
import { ShopCartQuoting } from "../shop-cart-quoting.service.js";

/**
 * Le devis de la boutique dit « remise retrait sur X € éligibles » (lot C du
 * plan `livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`).
 * Le vrai service, et les vrais services qu'il compose, montés sur des ports
 * doublés à la main.
 */
const PRICED_AT = new Date("2026-01-15T09:00:00.000Z");

const CATALOG: readonly UnsealedCatalogItem[] = [
  item("PAI-001", "Baguette", 100_000, 5.5),
  item("TAS-001", "Tasse", 1_000_000, 20),
];

function item(sku: string, name: string, unitPriceMillicents: number, vatRate: number) {
  return {
    family: PAINS,
    allergens: null,
    orderTimeLimit: null,
    sku,
    name,
    unitPriceMillicents,
    vatRate,
  };
}

const CLASSIFIED = {
  "PAI-001": { productId: "p_pain", categoryId: "c_pains", categoryPath: ["c_pains"] },
  "TAS-001": { productId: "p_tasse", categoryId: "c_objets", categoryPath: ["c_objets"] },
};

const MUGS_EXCLUDED: AudiencePickupDiscount = {
  adjustment: { mode: "percent", bp: 1_000 },
  scope: "all_except",
  categories: [{ categoryId: "c_objets", eligible: false }],
  products: [],
};

class NoPriceHistory extends CanonicalPriceHistoryReader {
  pricingAt(): Promise<ReadonlyMap<string, CatalogPricing>> {
    return Promise.resolve(new Map());
  }
  startsAt(): Promise<Date | null> {
    return Promise.resolve(null);
  }
}

class OnePoint extends PickupAddressRepository {
  constructor(private readonly point: PickupAddressView) {
    super();
  }
  list(): Promise<readonly PickupAddressView[]> {
    return Promise.resolve([this.point]);
  }
  resolve(): Promise<PickupAddressView | null> {
    return Promise.resolve(this.point);
  }
}

class NoZones extends DeliveryZoneRepository {
  list(): Promise<readonly DeliveryZoneView[]> {
    return Promise.resolve([]);
  }
  findById(): Promise<DeliveryZoneView | null> {
    return Promise.resolve(null);
  }
  resolveForPostalCode(): Promise<DeliveryZoneView | null> {
    return Promise.resolve(null);
  }
  create(): Promise<string> {
    return Promise.resolve("zone");
  }
  update(): Promise<void> {
    return Promise.resolve();
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
}

class Open extends DeliveryAvailabilityReader {
  current(): Promise<DeliveryAvailabilityView> {
    return Promise.resolve(DEFAULT_DELIVERY_AVAILABILITY);
  }
}

class NoPreference extends PreferredPickupReader {
  preferredPickupOf(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

class NoCompanies extends CompanyStatusReader {
  companyStatusOf(): Promise<OrderCompanyStatus | null> {
    return Promise.resolve(null);
  }
}

/** Aucun bon dans ces devis : la lecture ne doit pas être appelée. */
class NoVouchers extends LoyaltyVoucherQuoteReader {
  quote(): Promise<OrderVoucher> {
    return Promise.reject(new Error("aucun bon dans ce devis"));
  }
}

const empty = () => Promise.resolve([]);

function pricing(): OrderLinePricing {
  const catalog = new InMemoryProductCatalog(CATALOG);
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
  );
  const clock = new FixedClock(PRICED_AT);
  const pricer = new Pricer(
    loader,
    clock,
    new NoPriceHistory(),
    ownPricingParties(),
    new RecordingTimings(),
    new FixedStopwatch(),
  );
  return new OrderLinePricing(catalog, pricer, clock);
}

function quoting(b2c: AudiencePickupDiscount | null): ShopCartQuoting {
  const point: PickupAddressView = {
    id: "pickup_1",
    label: "Labo",
    ligne1: "5 rue du Four",
    ligne2: "",
    codePostal: "75002",
    ville: "Paris",
    pays: "France",
    discounts: { b2b: null, b2c },
    opening: { publicOpening: null, proPickup: null },
  };
  return new ShopCartQuoting(
    pricing(),
    new CartAdjustments(
      new OnePoint(point),
      new NoZones(),
      new Open(),
      new NoPreference(),
      new FixedLineClassifications(CLASSIFIED),
    ),
    new CustomerAudiences(new NoCompanies()),
    new OrderOperations(noSaleOperations(PRICED_AT)),
    new NoVouchers(),
    new FixedClock(PRICED_AT),
    new FixedDeliveryVat(),
  );
}

const PICKUP = { method: "pickup" as const, pickupAddressId: "pickup_1" };
const BASKET = [
  { sku: "PAI-001", quantity: 10 },
  { sku: "TAS-001", quantity: 1 },
];

describe("ShopCartQuoting — l'assiette de la remise de retrait (lot C)", () => {
  it("dit l'assiette éligible, HT et TTC, et nomme la ligne exclue", async () => {
    const { view } = await quoting(MUGS_EXCLUDED).quote({
      payload: { lines: BASKET, fulfillment: PICKUP },
      companyId: null,
      buyerUserId: null,
    });

    const bread = view.lines.find((line) => line.sku === "PAI-001");
    expect(view.pickupDiscountBase).toEqual({
      eligibleHtCents: bread?.lineTotalCents,
      eligibleTtcCents: bread?.lineTotalTtcCents,
      excludedSkus: ["TAS-001"],
    });
    // La remise est calculée sur CETTE assiette, et sur elle seule.
    expect(view.discountCents).toBe(Math.round((bread?.lineTotalCents ?? 0) / 10));
  });

  it("n'en dit rien quand la remise couvre tout le panier", async () => {
    const { view } = await quoting({ ...MUGS_EXCLUDED, categories: [] }).quote({
      payload: { lines: BASKET, fulfillment: PICKUP },
      companyId: null,
      buyerUserId: null,
    });

    expect(view.discountCents).toBeGreaterThan(0);
    expect(view).not.toHaveProperty("pickupDiscountBase");
  });

  it("n'en dit rien sans remise de retrait", async () => {
    const { view } = await quoting(null).quote({
      payload: { lines: BASKET, fulfillment: PICKUP },
      companyId: null,
      buyerUserId: null,
    });

    expect(view.discountCents).toBe(0);
    expect(view).not.toHaveProperty("pickupDiscountBase");
  });
});
