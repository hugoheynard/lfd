import {
  type AudiencePickupDiscount,
  type CatalogPricing,
  DEFAULT_DELIVERY_AVAILABILITY,
  type DeliveryAvailabilityView,
  type DeliveryVatMode,
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
import type { OrderLineClassification } from "../../../domain/ports/order-line-classification.reader.js";
import { PreferredPickupReader } from "../../../domain/ports/preferred-pickup.reader.js";
import { FixedDeliveryVat } from "../../commands/__tests__/fixed-delivery-vat.js";
import { CartAdjustments } from "../cart-adjustments.service.js";
import { CustomerAudiences } from "../customer-audiences.service.js";
import { OrderLinePricing } from "../order-line-pricing.service.js";
import { OrderOperations } from "../order-operations.service.js";
import { ShopCartQuoting } from "../shop-cart-quoting.service.js";

/**
 * Le devis de la boutique monté sur ses VRAIS services, ports doublés à la
 * main — partagé par les specs du devis (assiette de la remise, paniers pro
 * figés, voie B).
 */
export const PRICED_AT = new Date("2026-01-15T09:00:00.000Z");

/** Un article du catalogue, rangé dans les pains. */
export function catalogItem(
  sku: string,
  name: string,
  unitPriceMillicents: number,
  vatRate: number,
): UnsealedCatalogItem {
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

class OneZone extends DeliveryZoneRepository {
  constructor(private readonly zone: DeliveryZoneView | null) {
    super();
  }
  list(): Promise<readonly DeliveryZoneView[]> {
    return Promise.resolve(this.zone === null ? [] : [this.zone]);
  }
  findById(): Promise<DeliveryZoneView | null> {
    return Promise.resolve(this.zone);
  }
  resolveForPostalCode(): Promise<DeliveryZoneView | null> {
    return Promise.resolve(this.zone);
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

class CompanyAt extends CompanyStatusReader {
  constructor(private readonly status: OrderCompanyStatus | null) {
    super();
  }
  companyStatusOf(): Promise<OrderCompanyStatus | null> {
    return Promise.resolve(this.status);
  }
}

/** Le bon nommé au devis, ou aucun : sans bon, la lecture ne doit pas être appelée. */
class VoucherOf extends LoyaltyVoucherQuoteReader {
  constructor(private readonly valueCents: number | null) {
    super();
  }
  quote(voucherId: string): Promise<OrderVoucher> {
    return this.valueCents === null
      ? Promise.reject(new Error("aucun bon dans ce devis"))
      : Promise.resolve({ id: voucherId, valueCents: this.valueCents });
  }
}

const empty = () => Promise.resolve([]);

function pricingOf(catalog: readonly UnsealedCatalogItem[]): OrderLinePricing {
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
  return new OrderLinePricing(new InMemoryProductCatalog(catalog), pricer, clock);
}

/** Ce qui varie d'un devis à l'autre ; tout le reste est fixé. */
export interface QuotingSetup {
  readonly catalog: readonly UnsealedCatalogItem[];
  readonly b2c?: AudiencePickupDiscount | null;
  readonly b2b?: AudiencePickupDiscount | null;
  readonly zone?: DeliveryZoneView | null;
  readonly deliveryVatMode?: DeliveryVatMode;
  readonly classified?: Readonly<Record<string, OrderLineClassification>>;
  readonly companyStatus?: OrderCompanyStatus | null;
  readonly voucherCents?: number | null;
}

export function quotingOf(setup: QuotingSetup): ShopCartQuoting {
  const point: PickupAddressView = {
    id: "pickup_1",
    label: "Labo",
    ligne1: "5 rue du Four",
    ligne2: "",
    codePostal: "75002",
    ville: "Paris",
    pays: "France",
    discounts: { b2b: setup.b2b ?? null, b2c: setup.b2c ?? null },
    opening: { publicOpening: null, proPickup: null },
  };
  return new ShopCartQuoting(
    pricingOf(setup.catalog),
    new CartAdjustments(
      new OnePoint(point),
      new OneZone(setup.zone ?? null),
      new Open(),
      new NoPreference(),
      new FixedLineClassifications(setup.classified ?? {}),
    ),
    new CustomerAudiences(new CompanyAt(setup.companyStatus ?? null)),
    new OrderOperations(noSaleOperations(PRICED_AT)),
    new VoucherOf(setup.voucherCents ?? null),
    new FixedClock(PRICED_AT),
    new FixedDeliveryVat(setup.deliveryVatMode ?? "standard"),
  );
}
