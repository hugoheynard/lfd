import type { StandingCompanyStatus } from "../../shared/company-standing/domain/company-standing.js";
import {
  BasketPromotionsWouldCombineError,
  OverlappingPromotionError,
} from "./errors/promotion-errors.js";
import type { PromotionCatalogueArticle } from "./ports/promotion-catalogue.reader.js";
import { day } from "./promotion-act.js";
import { audienceCompanyIdOf, type PromotionAudience } from "./promotion-audience.js";
import {
  applicationPointOf,
  fulfillmentPickupIdOf,
  type PromotionFulfillment,
} from "./promotion-fulfillment.js";
import { promotionScopeCovers, type PromotionScopePoint } from "./promotion-scope.js";
import type { PromotionTerms, PromotionWindow } from "./promotion-terms.js";
import {
  audienceAdmits,
  fulfillmentAdmits,
  type FulfillmentFact,
  type PromotionAudienceFacts,
  type PromotionBuyerKind,
} from "./promotion-targeting.js";

/**
 * **Deux promotions qui ne doivent pas coexister** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.2, lot L7) — pur.
 *
 * L'agrégat ne voit qu'une promotion ; ces refus en comparent deux, sur le
 * catalogue vendable. Ils sont jugés à la pose, à la révision et à la reprise
 * d'une pause, contre toutes les promotions qui gardent leur place (non
 * archivées, en pause comprises).
 */

/** Une promotion qui garde sa place, réduite à ce que la comparaison lit. */
export interface PromotionRival {
  readonly id: string;
  readonly terms: PromotionTerms;
}

/**
 * **CHEVAUCHEMENT** : même point d'application, même public, même
 * acheminement, fenêtres qui se recouvrent, et au moins un article vendable
 * couvert par les deux. Le message nomme l'autre promotion et le premier
 * article commun, par ordre de nom.
 *
 * @throws {OverlappingPromotionError} un rival se dispute un article avec la candidate.
 */
export function assertNoOverlap(
  candidate: PromotionRival,
  rivals: readonly PromotionRival[],
  articles: readonly PromotionCatalogueArticle[],
): void {
  const point = applicationPointOf(candidate.terms.fulfillment);
  for (const rival of rivals) {
    if (rival.id === candidate.id || !sameTargeting(candidate.terms, rival.terms)) {
      continue;
    }
    const common = commonPeriod(candidate.terms, rival.terms);
    if (common === null) {
      continue;
    }
    const witness = articles.find(
      (article) =>
        promotionScopeCovers(candidate.terms.scope, article, scopePoint(point, article)) &&
        promotionScopeCovers(rival.terms.scope, article, scopePoint(point, article)),
    );
    if (witness !== undefined) {
      throw new OverlappingPromotionError(
        rival.id,
        rival.terms.internalName,
        `« ${witness.name} »`,
        describePeriod(common),
      );
    }
  }
}

/**
 * **Une seule promotion de panier par commande** jusqu'au lot L12 :
 * `composeExactOrder` ne compose qu'une remise de panier. Une promotion de
 * panier est refusée si une autre pourrait s'appliquer à une même commande —
 * un acheteur que les deux publics admettent, un acheminement que les deux
 * admettent, des fenêtres qui se recouvrent. L'article n'y entre pas : la
 * limite est par commande.
 *
 * @throws {BasketPromotionsWouldCombineError} un rival pourrait s'appliquer avec elle.
 */
export function assertSingleBasketPromotion(
  candidate: PromotionRival,
  rivals: readonly PromotionRival[],
): void {
  if (applicationPointOf(candidate.terms.fulfillment) !== "basket") {
    return;
  }
  for (const rival of rivals) {
    const combines =
      rival.id !== candidate.id &&
      applicationPointOf(rival.terms.fulfillment) === "basket" &&
      commonPeriod(candidate.terms, rival.terms) !== null &&
      audiencesMeet(candidate.terms.audience, rival.terms.audience) &&
      fulfillmentsMeet(candidate.terms.fulfillment, rival.terms.fulfillment);
    if (combines) {
      throw new BasketPromotionsWouldCombineError(rival.id, rival.terms.internalName);
    }
  }
}

function sameTargeting(left: PromotionTerms, right: PromotionTerms): boolean {
  return (
    left.audience.kind === right.audience.kind &&
    audienceCompanyIdOf(left.audience) === audienceCompanyIdOf(right.audience) &&
    left.fulfillment.kind === right.fulfillment.kind &&
    fulfillmentPickupIdOf(left.fulfillment) === fulfillmentPickupIdOf(right.fulfillment)
  );
}

/** La période commune de deux fenêtres (fin exclue), ou `null`. */
export function commonPeriod(
  left: PromotionWindow,
  right: PromotionWindow,
): PromotionWindow | null {
  const from = Math.max(left.validFrom.getTime(), right.validFrom.getTime());
  const ends = [left.validTo, right.validTo].filter((end): end is Date => end !== null);
  const to = ends.length === 0 ? null : Math.min(...ends.map((end) => end.getTime()));
  if (to !== null && to <= from) {
    return null;
  }
  return { validFrom: new Date(from), validTo: to === null ? null : new Date(to) };
}

/** La fin est exclue : le dernier jour couvert est la veille de la borne. */
const LAST_COVERED_MS = 1;

function describePeriod(period: PromotionWindow): string {
  const from = `du ${day(period.validFrom)}`;
  return period.validTo === null
    ? `à partir ${from}`
    : `${from} au ${day(new Date(period.validTo.getTime() - LAST_COVERED_MS))}`;
}

function scopePoint(
  point: "line" | "basket",
  article: PromotionCatalogueArticle,
): PromotionScopePoint {
  return point === "line" ? { kind: "line", saleUnit: article.saleUnit } : { kind: "basket" };
}

/** Les statuts d'une société qui commande encore ; une société close ne commande plus. */
const ORDERING_STATUSES: readonly StandingCompanyStatus[] = ["pending", "active", "suspended"];
const BUYER_KINDS: readonly PromotionBuyerKind[] = ["guest", "registered"];
/** Une société qu'aucun des deux publics ne nomme. */
const ANY_OTHER = "__unnamed__";

/**
 * **Un acheteur peut-il être admis par les deux publics ?** Jugé en
 * énumérant les acheteurs possibles et en posant à chacun la question même
 * du calcul (`audienceAdmits`) : une seconde écriture de la règle aurait fini
 * par la contredire.
 */
export function audiencesMeet(left: PromotionAudience, right: PromotionAudience): boolean {
  const named = [audienceCompanyIdOf(left), audienceCompanyIdOf(right)].filter(
    (id): id is string => id !== null,
  );
  const companies = [...new Set([...named, ANY_OTHER])];
  return possibleBuyers(companies).some(
    (facts) => audienceAdmits(left, facts) && audienceAdmits(right, facts),
  );
}

function possibleBuyers(companies: readonly string[]): PromotionAudienceFacts[] {
  const buyers: PromotionAudienceFacts[] = [];
  for (const buyerKind of BUYER_KINDS) {
    buyers.push(buyer(null, null, null, buyerKind));
    for (const companyId of companies) {
      for (const status of ORDERING_STATUSES) {
        for (const principal of [null, ...companies.filter((id) => id !== companyId)]) {
          buyers.push(buyer(companyId, status, principal, buyerKind));
        }
      }
    }
  }
  return buyers;
}

function buyer(
  companyId: string | null,
  companyStatus: StandingCompanyStatus | null,
  principal: string | null,
  buyerKind: PromotionBuyerKind,
): PromotionAudienceFacts {
  return {
    companyId,
    companyStatus,
    principal: { companyId: principal },
    buyerKind,
    fulfillment: null,
  };
}

/** **Une commande peut-elle être servie d'une façon que les deux admettent ?** */
export function fulfillmentsMeet(left: PromotionFulfillment, right: PromotionFulfillment): boolean {
  const points = [fulfillmentPickupIdOf(left), fulfillmentPickupIdOf(right)].filter(
    (id): id is string => id !== null,
  );
  const facts: FulfillmentFact[] = [
    { method: "delivery", pickupId: null },
    ...[...new Set([...points, ANY_OTHER])].map((pickupId): FulfillmentFact => ({
      method: "pickup",
      pickupId,
    })),
  ];
  return facts.some((fact) => fulfillmentAdmits(left, fact) && fulfillmentAdmits(right, fact));
}
