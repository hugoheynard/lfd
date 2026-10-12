import { type AdminOrdersQuery, addDays, localToInstant } from "@lfd/contracts";

import { InvalidOrderListDayError } from "../../domain/errors/admin-order-list-errors.js";
import type { AdminOrderListCriteria } from "../../domain/ports/admin-order-list.reader.js";
import { AdminOrderCursor } from "../../domain/value-objects/admin-order-cursor.js";

/** Au-delà, une recherche est un collage ; les mots suivants sont ignorés. */
const MAX_SEARCH_TERMS = 6;

const PARIS_MIDNIGHT = "00:00";

/**
 * Les filtres reçus → ce que le lecteur applique.
 *
 * Les jours de **passation** deviennent des instants à minuit de **Paris**
 * (`localToInstant`), la borne haute au lendemain exclu : `placedTo=12`
 * couvre tout le 12, heure d'été comme d'hiver. Les jours de **retrait** restent
 * des jours : la colonne est une date sans fuseau, comparée à des dates.
 */
export function adminOrderListCriteriaOf(query: AdminOrdersQuery): AdminOrderListCriteria {
  return {
    companyId: query.companyId ?? null,
    withSubAccounts: query.withSubAccounts === true,
    status: query.status ?? null,
    paymentStatus: query.paymentStatus ?? null,
    clientele: query.clientele ?? null,
    method: query.method ?? null,
    placedFrom:
      query.placedFrom === undefined ? null : parisMidnightOf("placedFrom", query.placedFrom),
    placedBefore:
      query.placedTo === undefined ? null : parisMidnightOf("placedTo", query.placedTo, 1),
    fulfillmentFrom:
      query.fulfillmentFrom === undefined
        ? null
        : existingDay("fulfillmentFrom", query.fulfillmentFrom),
    fulfillmentTo:
      query.fulfillmentTo === undefined ? null : existingDay("fulfillmentTo", query.fulfillmentTo),
    searchTerms: searchTermsOf(query.q),
    after: query.cursor === undefined ? null : AdminOrderCursor.decode(query.cursor),
    limit: query.limit,
  };
}

/** Minuit de Paris, `shift` jours après `day`. Minuit existe toujours à Paris. */
function parisMidnightOf(field: string, day: string, shift = 0): Date {
  const instant = localToInstant(addDays(day, shift), PARIS_MIDNIGHT);
  if (instant === null || addDays(day, 0) !== day) {
    throw new InvalidOrderListDayError(field, day);
  }
  return instant;
}

/**
 * Le jour tel quel, s'il existe. `addDays(day, 0)` normalise par le calendrier :
 * `2026-02-30` en ressort `2026-03-02`, ce qui suffit à le reconnaître.
 */
function existingDay(field: string, day: string): string {
  if (addDays(day, 0) !== day) {
    throw new InvalidOrderListDayError(field, day);
  }
  return day;
}

function searchTermsOf(q: string | undefined): readonly string[] {
  if (q === undefined) {
    return [];
  }
  return q
    .split(/\s+/)
    .filter((term) => term !== "")
    .slice(0, MAX_SEARCH_TERMS);
}
