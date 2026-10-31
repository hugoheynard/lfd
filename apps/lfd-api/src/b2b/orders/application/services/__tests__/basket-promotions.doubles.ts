import type { CustomerAudience } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  FixedBasketPromotions,
  FixedCompanyStatuses,
  FixedLinePromotions,
  FixedPrincipals,
} from "../../../../promotions/application/__tests__/promotion-supply.doubles.js";
import { PromotionAudienceFactsResolver } from "../../../../promotions/application/promotion-audience-facts.resolver.js";
import type { LivePromotion } from "../../../../promotions/domain/live-promotion.js";
import { BasketPromotionReader } from "../../../../promotions/domain/ports/basket-promotion.reader.js";
import { pickupDiscountPromotions } from "../../../../promotions/domain/__tests__/pickup-discount-reprise.fixture.js";
import type { PickupAddressRepository } from "../../../../pickup-addresses/domain/pickup-address.repository.js";
import { FixedLineClassifications } from "../../../domain/ports/__tests__/line-classification-doubles.js";
import type { OrderLineClassificationReader } from "../../../domain/ports/order-line-classification.reader.js";
import { BasketPromotions } from "../basket-promotions.service.js";
import { DeliveryZoneOfPostalCodeReader } from "../../../domain/ports/delivery-zone-of-postal-code.reader.js";
import { GuestSignInOffer } from "../guest-sign-in-offer.service.js";
import type { PickupBuyer } from "../cart-adjustments.service.js";

/** L'instant des suites qui ne jugent pas de fenêtre : une promotion posée « depuis toujours » y vaut. */
const NOW = new Date(Date.UTC(2030, 0, 1));

/**
 * **Le point panier sur ces promotions** — par défaut aucune : depuis L12,
 * la remise d'un site n'est plus lue, une suite qui veut une remise de
 * retrait pose la promotion de ce point.
 */
export function basketPromotions(
  promotions: readonly LivePromotion[] = [],
  classifications: OrderLineClassificationReader = new FixedLineClassifications({}),
  clock: FixedClock = new FixedClock(NOW),
): BasketPromotions {
  return new BasketPromotions(
    new FixedBasketPromotions(promotions),
    new PromotionAudienceFactsResolver(new FixedCompanyStatuses(), new FixedPrincipals()),
    classifications,
    clock,
  );
}

/**
 * **Les remises des points, lues en promotions** — ce que la reprise a écrit
 * de chaque remise de site (§ 13.4). Depuis L12 l'ancien chemin est retiré :
 * les suites qui configurent une remise sur la fiche d'un point la reçoivent
 * ainsi, posée en promotion de retrait à ce point, et gardent leurs
 * assertions.
 */
class PointDiscountPromotions extends BasketPromotionReader {
  constructor(private readonly points: PickupAddressRepository) {
    super();
  }

  async live(): Promise<readonly LivePromotion[]> {
    return pickupDiscountPromotions(await this.points.list(null));
  }

  liveAt(): Promise<readonly LivePromotion[]> {
    return this.live();
  }
}

/** Le point panier sur les remises de ces points, reprises en promotions. */
export function pointDiscountPromotions(
  points: PickupAddressRepository,
  classifications: OrderLineClassificationReader = new FixedLineClassifications({}),
  clock: FixedClock = new FixedClock(NOW),
): BasketPromotions {
  return new BasketPromotions(
    new PointDiscountPromotions(points),
    new PromotionAudienceFactsResolver(new FixedCompanyStatuses(), new FixedPrincipals()),
    classifications,
    clock,
  );
}

/**
 * Qui commande, pour une clientèle : un pro est une société ACTIVE (c'est ce
 * que `audienceOf` dit d'un `b2b`), un particulier n'en a pas.
 */
export function pickupBuyer(audience: CustomerAudience, companyId: string | null): PickupBuyer {
  return {
    audience,
    // Un pro a toujours une société : sans elle, la promotion « pros actifs »
    // (la reprise d'une remise de pros) ne l'admettrait pas (L12).
    companyId: audience === "b2b" ? (companyId ?? "co_pro") : companyId,
    companyStatus: audience === "b2b" ? "active" : null,
    buyerKind: "registered",
  };
}

/** **Ce qu'une connexion ouvrirait à un invité** (L10) — par défaut, aucune promotion. */
export function guestSignInOffer(
  promotions: {
    readonly line?: readonly LivePromotion[];
    readonly basket?: readonly LivePromotion[];
  } = {},
  classifications: OrderLineClassificationReader = new FixedLineClassifications({}),
  clock: FixedClock = new FixedClock(NOW),
): GuestSignInOffer {
  return new GuestSignInOffer(
    new FixedLinePromotions(promotions.line ?? []),
    new FixedBasketPromotions(promotions.basket ?? []),
    classifications,
    new FixedZoneOfPostalCode(),
    clock,
  );
}

/**
 * La zone d'un code postal : `zone_<code>` pour tout code postal, sauf ceux
 * de `uncovered` (plan des acheminements, § 8.1).
 */
export class FixedZoneOfPostalCode extends DeliveryZoneOfPostalCodeReader {
  constructor(private readonly uncovered: readonly string[] = []) {
    super();
  }

  zoneIdOf(codePostal: string): Promise<string | null> {
    return Promise.resolve(this.uncovered.includes(codePostal) ? null : `zone_${codePostal}`);
  }
}
