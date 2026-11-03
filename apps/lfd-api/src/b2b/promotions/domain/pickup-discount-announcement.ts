import type {
  AudiencePickupDiscount,
  CartAdjustment,
  AnnouncedPickupDiscounts,
  DiscountLabelView,
  PickupAnnouncementKey,
} from "@lfd/contracts";

import {
  promotionsAdmitted,
  targetingRankOf,
  type AdmittedPromotion,
  type LivePromotion,
} from "./live-promotion.js";
import type { PromotionEffect } from "./promotion-effect.js";
import { applicationPointOf } from "./promotion-fulfillment.js";
import { TYPICAL_BUYER, type PromotionAudienceFacts } from "./promotion-targeting.js";

/**
 * **Ce que la boutique ANNONCE d'un point de retrait**, tiré des promotions
 * (`documentation/promotions/promotions.md`, § 2.16, lot L8) — pur.
 *
 * Le contrat `PickupAddressView.discounts` porte UNE remise par acheteur
 * type. Après la bascule, la caisse applique la promotion panier gagnante ;
 * l'annonce doit dire la même, sans que la boutique change. La question est
 * donc posée avec les faits d'un acheteur TYPE, au même juge que la caisse
 * (`promotionsAdmitted`, puis le rang du public et de l'acheminement) :
 *
 * - `b2b` : une société active (ou suspendue, 2026-11-03), sans identité (aucun public « société » ne
 *   la vise), porte d'entrée inconnue ;
 * - `b2bPending` : une société EN ATTENTE, sans identité, porte inconnue ;
 * - `b2c` : aucune société, porte d'entrée inconnue.
 *
 * `b2bPending` ferme une sur-annonce (2026-10-31, Hugo, option a) : la
 * clientèle d'une société en attente est `b2c` (`audienceOf`), mais la
 * caisse la sert en pro (`companyServiceOf('pending') = 'pro'`) et juge ses
 * publics avec `companyStatus: 'pending'`. Elle lisait l'annonce `b2c` — une
 * promotion `individuals` lui était promise, la caisse retirait 0 ; et une
 * promotion `pros` lui était retirée sans être annoncée. La boutique choisit
 * l'annonce par `pickupAnnouncementOf(statut)`.
 *
 * Les faits de ces acheteurs types sont `TYPICAL_BUYER` (`promotion-targeting.ts`),
 * la définition que la grille de prix lit aussi pour son « pro type »
 * (`plan-export-grille-de-prix.md`, § 8.4).
 *
 * Exact pour les publics qui ne dépendent que du statut de la société —
 * `everyone`, `pros`, `pros_active`, `pros_pending`, `individuals`,
 * `everyone_but_active_pros`, ceux de la reprise. Un public plus fin (une
 * société, les invités ou les inscrits) n'est pas annoncé à l'acheteur type,
 * dont la porte est inconnue : le contrat ne sait pas le dire.
 *
 * Le libellé annoncé est celui que la caisse figera (L8b, § 15.8,
 * `labelAudienceOf`) : `b2b` et `b2bPending` lisent le libellé Pros — une
 * société en attente est servie en pro —, `b2c` le libellé Particuliers,
 * repli sur le commun.
 *
 * Une promotion que le contrat ne sait pas porter n'est pas annoncée non plus
 * plutôt que d'être annoncée fausse : une cible déclinaison (le contrat ne
 * connaît que familles et produits), une condition de quantité. Une promotion
 * à jours et heures n'est annoncée que pendant ses heures, et jamais celle
 * jugée au créneau : le contrat n'a pas de place pour dire « de 17 h à 19 h ».
 */

/** Les trois remises annoncées d'un point, à l'instant `at`. */
export function announcedPickupDiscounts(
  promotions: readonly LivePromotion[],
  pickupId: string,
  at: Date,
): Required<AnnouncedPickupDiscounts> {
  return {
    b2b: announcedFor("b2b", promotions, pickupId, at),
    b2bPending: announcedFor("b2bPending", promotions, pickupId, at),
    b2c: announcedFor("b2c", promotions, pickupId, at),
  };
}

function announcedFor(
  clientele: PickupAnnouncementKey,
  promotions: readonly LivePromotion[],
  pickupId: string,
  at: Date,
): AudiencePickupDiscount | null {
  const facts: PromotionAudienceFacts = {
    ...TYPICAL_BUYER[clientele],
    fulfillment: { method: "pickup", pickupId },
  };
  const basket = promotions.filter(
    (promotion) => applicationPointOf(promotion.fulfillment) === "basket",
  );
  // Sans créneau : une promotion jugée au créneau n'est pas annoncée, une
  // promotion à heures ne l'est que pendant ses heures (plan jours et heures,
  // § 8) — le contrat ne sait pas dire des heures.
  const winner = mostSpecific(promotionsAdmitted(basket, at, facts, null));
  return winner === null ? null : asPickupDiscount(winner);
}

/**
 * Le rang de la caisse (`chooseBasketPromotion`) : public, acheminement, puis
 * la plus avantageuse (§ 15.6) — sans panier, seulement entre deux effets de
 * même nature (deux taux, deux montants) —, puis l'identifiant. L'écran
 * refuse deux promotions panier NON cumulables qui pourraient s'appliquer
 * ensemble (`BasketPromotionsWouldCombineError`). Depuis M7, des promotions
 * panier cumulables s'enchaînent à la caisse : le contrat n'annonçant qu'une
 * remise par acheteur type, seule la plus spécifique est annoncée ici, et la
 * caisse en retire davantage (vérifié le 2026-10-31 : `PickupDiscounts`
 * porte un `AudiencePickupDiscount` par clientèle).
 */
function mostSpecific(candidates: readonly AdmittedPromotion[]): AdmittedPromotion | null {
  let best: AdmittedPromotion | null = null;
  for (const promotion of candidates) {
    if (best === null || beats(promotion, best)) {
      best = promotion;
    }
  }
  return best;
}

function beats(candidate: AdmittedPromotion, best: AdmittedPromotion): boolean {
  const mine = targetingRankOf(candidate);
  const theirs = targetingRankOf(best);
  const deltas = [
    mine.publicRank - theirs.publicRank,
    mine.fulfillmentRank - theirs.fulfillmentRank,
    advantageDelta(candidate.effect, best.effect),
  ];
  const decisive = deltas.find((delta) => delta !== 0);
  return decisive === undefined ? candidate.id < best.id : decisive > 0;
}

/** Plus avantageux pour le client, entre deux effets de même nature ; `0` sinon. */
function advantageDelta(left: PromotionEffect, right: PromotionEffect): number {
  if (left.kind === "percent_off" && right.kind === "percent_off") {
    return left.basisPoints - right.basisPoints;
  }
  if (left.kind === "basket_amount_off" && right.kind === "basket_amount_off") {
    return left.cents - right.cents;
  }
  return 0;
}

/** La promotion dans la forme du contrat, ou `null` si elle ne s'y exprime pas. */
function asPickupDiscount(promotion: AdmittedPromotion): AudiencePickupDiscount | null {
  const adjustment = adjustmentOf(promotion.effect);
  const rules = promotion.scope.rules;
  if (
    adjustment === null ||
    promotion.conditions.some((condition) => condition.kind !== "weekly_hours") ||
    rules.some((rule) => rule.target === "variant")
  ) {
    return null;
  }
  // L'ordre de la fiche d'un site : par cible, pour une lecture stable.
  const sorted = [...rules].sort((left, right) => left.targetId.localeCompare(right.targetId));
  return {
    adjustment,
    label: promotion.servedLabel,
    ...tileTextOf(promotion),
    scope: promotion.scope.mode,
    categories: sorted
      .filter((rule) => rule.target === "category")
      .map((rule) => ({ categoryId: rule.targetId, eligible: rule.eligible })),
    products: sorted
      .filter((rule) => rule.target === "product")
      .map((rule) => ({ productId: rule.targetId, eligible: rule.eligible })),
  };
}

/** Le texte sur les vignettes, trois langues sans trou ; rien s'il n'est pas réglé. */
function tileTextOf(promotion: AdmittedPromotion): { readonly tileText?: DiscountLabelView } {
  const text = promotion.tileText;
  if (text === null) {
    return {};
  }
  return { tileText: { fr: text.fr, en: text.en ?? text.fr, it: text.it ?? text.fr } };
}

function adjustmentOf(effect: PromotionEffect): CartAdjustment | null {
  switch (effect.kind) {
    case "percent_off":
      return { mode: "percent", bp: effect.basisPoints };
    case "basket_amount_off":
      return { mode: "amount", cents: effect.cents };
    case "unit_amount_off":
    case "fixed_unit_price":
      return null;
  }
}
