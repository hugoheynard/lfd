import type { CustomerAudience } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  FixedBasketPromotions,
  FixedCompanyStatuses,
  FixedLinePromotions,
  FixedPrincipals,
  FixedPromotionsSource,
  RecordingShadowJournal,
} from "../../../../promotions/application/__tests__/promotion-supply.doubles.js";
import { PromotionAudienceFactsResolver } from "../../../../promotions/application/promotion-audience-facts.resolver.js";
import type { LivePromotion } from "../../../../promotions/domain/live-promotion.js";
import type { PromotionShadowJournal } from "../../../../promotions/domain/ports/promotion-shadow.journal.js";
import type { PromotionsSource } from "../../../../promotions/domain/promotions-source.js";
import { FixedLineClassifications } from "../../../domain/ports/__tests__/line-classification-doubles.js";
import type { OrderLineClassificationReader } from "../../../domain/ports/order-line-classification.reader.js";
import { BasketPromotions } from "../basket-promotions.service.js";
import { GuestSignInOffer } from "../guest-sign-in-offer.service.js";
import type { PickupBuyer } from "../cart-adjustments.service.js";

/** L'instant des suites qui ne jugent pas de fenêtre : une promotion posée « depuis toujours » y vaut. */
const NOW = new Date(Date.UTC(2030, 0, 1));

/**
 * **Le point panier sous une source donnée** — par défaut `legacy`, qui rend
 * la remise du site sans rien lire d'autre : ce que les suites d'avant L5
 * éprouvent.
 */
export function basketPromotions(
  source: PromotionsSource = "legacy",
  promotions: readonly LivePromotion[] = [],
  journal: PromotionShadowJournal = new RecordingShadowJournal(),
  classifications: OrderLineClassificationReader = new FixedLineClassifications({}),
  clock: FixedClock = new FixedClock(NOW),
): BasketPromotions {
  return new BasketPromotions(
    new FixedPromotionsSource(source),
    new FixedBasketPromotions(promotions),
    new PromotionAudienceFactsResolver(new FixedCompanyStatuses(), new FixedPrincipals()),
    classifications,
    journal,
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
    companyId,
    companyStatus: audience === "b2b" ? "active" : null,
    buyerKind: "registered",
  };
}

/**
 * **Ce qu'une connexion ouvrirait à un invité** (L10) — par défaut `legacy`,
 * qui ne lit rien et ne dit rien : ce que les suites d'avant L10 éprouvent.
 */
export function guestSignInOffer(
  source: PromotionsSource = "legacy",
  promotions: {
    readonly line?: readonly LivePromotion[];
    readonly basket?: readonly LivePromotion[];
  } = {},
  classifications: OrderLineClassificationReader = new FixedLineClassifications({}),
  clock: FixedClock = new FixedClock(NOW),
): GuestSignInOffer {
  return new GuestSignInOffer(
    new FixedPromotionsSource(source),
    new FixedLinePromotions(promotions.line ?? []),
    new FixedBasketPromotions(promotions.basket ?? []),
    classifications,
    clock,
  );
}
