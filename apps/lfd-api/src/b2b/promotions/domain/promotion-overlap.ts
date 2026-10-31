import type { StandingCompanyStatus } from "../../shared/company-standing/domain/company-standing.js";
import {
  BasketPromotionsWouldCombineError,
  OverlappingPromotionError,
  TooManyCumulativeBasketPromotionsError,
} from "./errors/promotion-errors.js";
import type { PromotionCatalogueArticle } from "./ports/promotion-catalogue.reader.js";
import { day } from "./promotion-act.js";
import { audienceCompanyIdOf, type PromotionAudience } from "./promotion-audience.js";
import type { PromotionAudienceSet } from "./promotion-audience-set.js";
import {
  applicationPointOf,
  listedPointsOf,
  listedZonesOf,
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
 * **Deux promotions qui ne doivent pas coexister** (`documentation/promotions/promotions.md`, § 2.16, lot L7) — pur.
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
 * **CHEVAUCHEMENT** : même point d'application, des acheminements qui
 * admettent une même commande (`promotions.md`, § 2.14), des
 * publics dont les COUVERTURES se croisent (une feuille de la partition, ou
 * une même société — § 15.6, L8b), fenêtres qui se recouvrent, et au moins
 * un article vendable couvert par les deux. Le message nomme l'autre
 * promotion, le public commun et le premier article commun, par ordre de nom.
 *
 * Depuis L8b, `{pros}` contre `{pros_active}` est REFUSÉ (accepté avant, les
 * rangs différant) : les deux visent les pros actifs.
 *
 * Depuis L12 (§ 16), deux promotions **toutes deux cumulables** ne se
 * disputent rien : elles se combinent, l'une après l'autre. Le refus ne
 * s'applique plus entre elles — il reste entre une cumulable et une non
 * cumulable, et entre deux non cumulables.
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
    if (candidate.terms.cumulative && rival.terms.cumulative) {
      continue;
    }
    const crossing = rival.id === candidate.id ? null : crossingOf(candidate.terms, rival.terms);
    if (crossing === null) {
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
        crossing,
        `« ${witness.name} »`,
        describePeriod(common),
      );
    }
  }
}

/**
 * **Une seule promotion de panier NON CUMULABLE par commande** : une
 * promotion de panier est refusée si une autre pourrait s'appliquer à une
 * même commande — un acheteur que les deux publics admettent, un
 * acheminement que les deux admettent, des fenêtres qui se recouvrent.
 * L'article n'y entre pas : la limite est par commande.
 *
 * Depuis M7 (plan des promotions, § 18.6), deux promotions de panier
 * **toutes deux cumulables** ne se disputent rien : elles s'enchaînent sur la
 * commande (`chooseBasketPromotions`), cinq au plus. Le refus reste entre une
 * cumulable et une non cumulable, et entre deux non cumulables — comme au
 * point ligne (`assertNoOverlap`).
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
    if (candidate.terms.cumulative && rival.terms.cumulative) {
      continue;
    }
    const combines =
      rival.id !== candidate.id &&
      applicationPointOf(rival.terms.fulfillment) === "basket" &&
      commonPeriod(candidate.terms, rival.terms) !== null &&
      audienceSetsMeet(candidate.terms.audiences, rival.terms.audiences) &&
      fulfillmentsMeet(candidate.terms.fulfillment, rival.terms.fulfillment);
    if (combines) {
      throw new BasketPromotionsWouldCombineError(rival.id, rival.terms.internalName);
    }
  }
}

/**
 * Le plafond des remises de panier d'une commande (plan des promotions,
 * § 18.8, arbitrage n° 5) — la source unique : la commande le relit
 * (`MAX_BASKET_DISCOUNTS`).
 */
export const MAX_BASKET_DISCOUNTS_PER_ORDER = 5;

/**
 * **Pas de sixième promotion panier cumulable sur une même commande**
 * (décision du 2026-10-31, mandat, lot M7) : une cumulable de panier est
 * refusée si cinq autres cumulables pourraient s'appliquer avec elle — un
 * acheteur que les publics admettent, un acheminement qu'ils admettent, des
 * fenêtres qui se recouvrent. Jugé deux à deux avec la candidate : un
 * garde-fou à la pose, la caisse garde de toute façon les cinq premières.
 *
 * @throws {TooManyCumulativeBasketPromotionsError}
 */
export function assertCumulativeBasketCapacity(
  candidate: PromotionRival,
  rivals: readonly PromotionRival[],
): void {
  if (!candidate.terms.cumulative || applicationPointOf(candidate.terms.fulfillment) !== "basket") {
    return;
  }
  const companions = rivals.filter(
    (rival) =>
      rival.id !== candidate.id &&
      rival.terms.cumulative &&
      applicationPointOf(rival.terms.fulfillment) === "basket" &&
      commonPeriod(candidate.terms, rival.terms) !== null &&
      audienceSetsMeet(candidate.terms.audiences, rival.terms.audiences) &&
      fulfillmentsMeet(candidate.terms.fulfillment, rival.terms.fulfillment),
  );
  if (companions.length >= MAX_BASKET_DISCOUNTS_PER_ORDER) {
    throw new TooManyCumulativeBasketPromotionsError(
      companions.map((rival) => rival.terms.internalName).sort(),
      MAX_BASKET_DISCOUNTS_PER_ORDER,
    );
  }
}

/** Le public commun de deux promotions dont les acheminements se croisent, ou `null`. */
function crossingOf(left: PromotionTerms, right: PromotionTerms): string | null {
  return fulfillmentsMeet(left.fulfillment, right.fulfillment)
    ? left.audiences.crossing(right.audiences)
    : null;
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
 * **Deux publics à plusieurs cibles peuvent-ils admettre un même acheteur ?**
 * Une paire de cibles qui se rencontre (§ 15.6) — les sociétés nommées des
 * DEUX ensembles sont énumérées : sans elles, un acheteur de la société de
 * droite ne le serait jamais.
 */
export function audienceSetsMeet(left: PromotionAudienceSet, right: PromotionAudienceSet): boolean {
  const named = [...left.targets, ...right.targets]
    .map(audienceCompanyIdOf)
    .filter((id): id is string => id !== null);
  return left.targets.some((mine) =>
    right.targets.some((theirs) => audiencesMeet(mine, theirs, named)),
  );
}

/**
 * **Un acheteur peut-il être admis par les deux publics ?** Jugé en
 * énumérant les acheteurs possibles et en posant à chacun la question même
 * du calcul (`audienceAdmits`) : une seconde écriture de la règle aurait fini
 * par la contredire. `extraCompanies` : les sociétés nommées ailleurs dans
 * les deux ensembles.
 */
export function audiencesMeet(
  left: PromotionAudience,
  right: PromotionAudience,
  extraCompanies: readonly string[] = [],
): boolean {
  const named = [audienceCompanyIdOf(left), audienceCompanyIdOf(right), ...extraCompanies].filter(
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

/**
 * **Une commande peut-elle être servie d'une façon que les deux admettent ?**
 * Témoins (`promotions.md`, § 2.14) : chaque point et chaque zone
 * nommés, « un autre point », « une autre zone », « livraison sans zone ».
 */
export function fulfillmentsMeet(left: PromotionFulfillment, right: PromotionFulfillment): boolean {
  const points = [...listedPointsOf(left), ...listedPointsOf(right), ANY_OTHER];
  const zones = [...listedZonesOf(left), ...listedZonesOf(right), ANY_OTHER];
  const facts: FulfillmentFact[] = [
    ...[...new Set(points)].map((pickupId): FulfillmentFact => ({ method: "pickup", pickupId })),
    ...[...new Set(zones)].map((zoneId): FulfillmentFact => ({ method: "delivery", zoneId })),
    { method: "delivery", zoneId: null },
  ];
  return facts.some((fact) => fulfillmentAdmits(left, fact) && fulfillmentAdmits(right, fact));
}
