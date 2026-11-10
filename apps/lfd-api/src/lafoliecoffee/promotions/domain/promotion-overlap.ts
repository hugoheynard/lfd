import {
  BasketPromotionsWouldCombineError,
  OverlappingPromotionError,
  TooManyCumulativeBasketPromotionsError,
} from "./errors/promotion-errors.js";
import type { PromotionCatalogueArticle } from "./ports/promotion-catalogue.reader.js";
import { day } from "./promotion-act.js";
import { weeklyHoursOf } from "./promotion-condition.js";
import { applicationPointOf } from "./promotion-fulfillment.js";
import { audienceSetsMeet, fulfillmentsMeet } from "./promotion-meeting.js";
import { sharedArticleOf } from "./promotion-shared-article.js";
import type { PromotionTerms, PromotionWindow } from "./promotion-terms.js";
import { weeklyHoursMeet } from "./promotion-weekly-hours.js";

export { audienceSetsMeet, audiencesMeet, fulfillmentsMeet } from "./promotion-meeting.js";

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
  for (const rival of rivals) {
    const overlap = overlapOf(candidate, rival, articles);
    if (overlap !== null) {
      throw new OverlappingPromotionError(
        rival.id,
        rival.terms.internalName,
        overlap.crossing,
        `« ${overlap.witness.name} »`,
        describePeriod(overlap.period),
      );
    }
  }
}

/** Ce que deux promotions se disputent : le public commun, la période, un article. */
export interface PromotionOverlap {
  readonly crossing: string;
  readonly period: PromotionWindow;
  readonly witness: PromotionCatalogueArticle;
}

/**
 * **Le chevauchement de deux promotions**, ou `null` — la règle de
 * {@link assertNoOverlap}, sans le refus : la liste des conflits que
 * l'extension au poids ferait naître la relit (`promotion-weight-conflicts.ts`).
 */
export function overlapOf(
  candidate: PromotionRival,
  rival: PromotionRival,
  articles: readonly PromotionCatalogueArticle[],
): PromotionOverlap | null {
  if (candidate.terms.cumulative && rival.terms.cumulative) {
    return null;
  }
  const crossing = rival.id === candidate.id ? null : crossingOf(candidate.terms, rival.terms);
  if (crossing === null) {
    return null;
  }
  const period = commonPeriod(candidate.terms, rival.terms);
  if (period === null) {
    return null;
  }
  const point = applicationPointOf(candidate.terms.fulfillment);
  const witness = sharedArticleOf(candidate.terms, rival.terms, articles, point);
  return witness === null ? null : { crossing, period, witness };
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
    if (rival.id !== candidate.id && basketsMeet(candidate.terms, rival.terms)) {
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
      basketsMeet(candidate.terms, rival.terms),
  );
  if (companions.length >= MAX_BASKET_DISCOUNTS_PER_ORDER) {
    throw new TooManyCumulativeBasketPromotionsError(
      companions.map((rival) => rival.terms.internalName).sort(),
      MAX_BASKET_DISCOUNTS_PER_ORDER,
    );
  }
}

/**
 * Une promotion de panier (`right`) peut-elle valoir pour une même commande
 * que `left` ? Fenêtres, publics, acheminements, jours et heures (plan jours
 * et heures, § 8, « Recouvrement »).
 */
function basketsMeet(left: PromotionTerms, right: PromotionTerms): boolean {
  return (
    applicationPointOf(right.fulfillment) === "basket" &&
    commonPeriod(left, right) !== null &&
    audienceSetsMeet(left.audiences, right.audiences) &&
    fulfillmentsMeet(left.fulfillment, right.fulfillment) &&
    hoursMeet(left, right)
  );
}

function hoursMeet(left: PromotionTerms, right: PromotionTerms): boolean {
  return weeklyHoursMeet(weeklyHoursOf(left.conditions), weeklyHoursOf(right.conditions));
}

/**
 * Le public commun de deux promotions dont les acheminements — et les jours
 * et heures — se croisent, ou `null`.
 */
function crossingOf(left: PromotionTerms, right: PromotionTerms): string | null {
  return fulfillmentsMeet(left.fulfillment, right.fulfillment) && hoursMeet(left, right)
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
