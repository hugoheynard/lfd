import {
  DEFAULT_DELIVERY_PRICING,
  UNSET_DELIVERY_AUDIENCE_TERMS,
  type AdminDeliveryZoneView,
  type DeliveryPricingTerms,
  type DeliveryPricingView,
  type DeliveryZoneView,
} from "@lfd/contracts";

import { DeliveryPricingReader } from "../../domain/ports/delivery-pricing.reader.js";
import { DeliveryZoneTermsReader } from "../../domain/ports/delivery-zone-terms.reader.js";
import { DeliveryZoneFeeResolver } from "../delivery-zone-fee.resolver.js";

/** Aucun remplacement, pour les deux audiences. */
export const NO_OVERRIDES: DeliveryPricingTerms = {
  b2b: UNSET_DELIVERY_AUDIENCE_TERMS,
  b2c: UNSET_DELIVERY_AUDIENCE_TERMS,
};

/** Les zones, avec leurs remplacements ; compte les lectures. */
export class FixedZoneTerms extends DeliveryZoneTermsReader {
  lookups = 0;

  constructor(private readonly zones: readonly AdminDeliveryZoneView[]) {
    super();
  }

  list(): Promise<readonly AdminDeliveryZoneView[]> {
    this.lookups += 1;
    return Promise.resolve(this.zones);
  }
}

/** Le réglage global, figé. */
export class FixedDeliveryPricing extends DeliveryPricingReader {
  constructor(private readonly terms: DeliveryPricingTerms = NO_OVERRIDES) {
    super();
  }

  current(): Promise<DeliveryPricingView> {
    return Promise.resolve({ ...DEFAULT_DELIVERY_PRICING, ...this.terms });
  }
}

/** Une zone publique, sans remplacement. */
export function withoutOverrides(zone: DeliveryZoneView): AdminDeliveryZoneView {
  return { ...zone, audienceTerms: NO_OVERRIDES };
}

/**
 * Le VRAI résolveur du frais (zone → global → ancien frais), sur des zones et
 * un réglage global en mémoire. Sans réglage ni remplacement, chaque audience
 * paie l'ancien frais de la zone — ce que les suites d'avant le 0b supposent.
 */
export function zoneFees(
  zones: readonly (DeliveryZoneView | AdminDeliveryZoneView)[],
  global: DeliveryPricingTerms = NO_OVERRIDES,
): DeliveryZoneFeeResolver {
  return new DeliveryZoneFeeResolver(
    new FixedZoneTerms(
      zones.map((zone) => ("audienceTerms" in zone ? zone : withoutOverrides(zone))),
    ),
    new FixedDeliveryPricing(global),
  );
}
