import {
  DEFAULT_DELIVERY_AVAILABILITY,
  type DeliveryAvailabilityView,
  type DeliveryVatMode,
  type DeliveryZoneView,
  type PickupAddressView,
} from "@lfd/contracts";

import type { Clock } from "../../../../../platform/time/clock.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { CanonicalPriceHistoryReader } from "../../../../catalog/domain/ports/canonical-price-history.reader.js";
import { DeliveryAvailabilityReader } from "../../../../delivery-availability/domain/ports/delivery-availability.reader.js";
import { DeliveryZoneRepository } from "../../../../delivery-zones/domain/delivery-zone.repository.js";
import { PickupAddressRepository } from "../../../../pickup-addresses/domain/pickup-address.repository.js";
import type { LivePromotion } from "../../../../promotions/domain/live-promotion.js";
import { FixedLineClassifications } from "../../../domain/ports/__tests__/line-classification-doubles.js";
import {
  CompanyStatusReader,
  type OrderCompanyStatus,
} from "../../../domain/ports/company-status.reader.js";
import { PreferredPickupReader } from "../../../domain/ports/preferred-pickup.reader.js";
import { FixedDeliveryVat } from "../../commands/__tests__/fixed-delivery-vat.js";
import { CartAdjustments } from "../cart-adjustments.service.js";
import { CustomerAudiences } from "../customer-audiences.service.js";
import { PricingContext } from "../pricing-context.service.js";
import { basketPromotions } from "./basket-promotions.doubles.js";
import { catalogItem, pricingOf, PRICED_AT } from "./shop-cart-quoting.doubles.js";

/**
 * `PricingContext` monté sur ses vrais collaborateurs, ports doublés à la
 * main (plan `le-prix-d-un-panier.md`, § 2.1) — chaque double compte ses
 * lectures : le chargement s'arrête au premier refus, et ne lit pas la suite.
 */

export const LABO: PickupAddressView = {
  id: "site_labo",
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "75002",
  ville: "Paris",
  pays: "France",
  discounts: { b2b: null, b2c: null },
  opening: { publicOpening: { start: "08:00", end: "12:00" }, proPickup: null },
};

export const ZONE: DeliveryZoneView = {
  id: "zone_1",
  label: "Paris",
  postalPrefixes: ["75002"],
  fee: { mode: "amount", cents: 800 },
};

/** Le point, compté ; une panne posée y remonte telle quelle. */
export class CountedPoints extends PickupAddressRepository {
  reads = 0;

  constructor(
    private readonly point: PickupAddressView = LABO,
    private readonly failure: Error | null = null,
  ) {
    super();
  }

  list(): Promise<readonly PickupAddressView[]> {
    this.reads += 1;
    return Promise.resolve([this.point]);
  }

  resolve(): Promise<PickupAddressView | null> {
    this.reads += 1;
    return this.failure === null ? Promise.resolve(this.point) : Promise.reject(this.failure);
  }
}

class OneZone extends DeliveryZoneRepository {
  list(): Promise<readonly DeliveryZoneView[]> {
    return Promise.resolve([ZONE]);
  }
  findById(): Promise<DeliveryZoneView | null> {
    return Promise.resolve(ZONE);
  }
  resolveForPostalCode(): Promise<DeliveryZoneView | null> {
    return Promise.resolve(ZONE);
  }
  create(): Promise<string> {
    return Promise.resolve(ZONE.id);
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

class StatusOf extends CompanyStatusReader {
  constructor(private readonly status: OrderCompanyStatus | null) {
    super();
  }
  companyStatusOf(): Promise<OrderCompanyStatus | null> {
    return Promise.resolve(this.status);
  }
}

/** Ce qui varie d'une suite à l'autre. */
export interface PricingContextSetup {
  readonly points?: CountedPoints;
  readonly promotions?: readonly LivePromotion[];
  readonly deliveryVatMode?: DeliveryVatMode;
  readonly companyStatus?: OrderCompanyStatus | null;
  readonly gate?: { readonly clock?: Clock; readonly history?: CanonicalPriceHistoryReader };
}

/** Le chargeur, et ses doubles comptés. */
export function pricingContextOf(setup: PricingContextSetup = {}) {
  const points = setup.points ?? new CountedPoints();
  const deliveryVat = new FixedDeliveryVat(setup.deliveryVatMode ?? "standard");
  const classifications = new FixedLineClassifications({
    "PAI-001": {
      productId: "p_pain",
      categoryId: "c_pains",
      categoryPath: ["c_pains"],
      madeToOrder: false,
    },
  });
  const loader = new PricingContext(
    pricingOf([catalogItem("PAI-001", "Pain", 200_000, 5.5)], {}, setup.gate ?? {}),
    new CartAdjustments(
      points,
      new OneZone(),
      new Open(),
      new NoPreference(),
      basketPromotions(setup.promotions ?? [], classifications, new FixedClock(PRICED_AT)),
    ),
    classifications,
    new CustomerAudiences(new StatusOf(setup.companyStatus ?? null)),
    deliveryVat,
  );
  return { loader, points, deliveryVat, classifications };
}
