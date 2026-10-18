import { weekdayOfDate } from "@lfd/contracts";

import type { FulfillmentTarget } from "../orderable-today.js";
import { hoursCover, type SuggestionConditions } from "../value-objects/suggestion-conditions.js";

/**
 * Le point de retrait que vise le client : pas encore choisi, la livraison, ou
 * un point. Un panier sans jour visé n'a pas de site non plus.
 */
export type ShopSite =
  | { readonly kind: "unknown" }
  | { readonly kind: "delivery" }
  | { readonly kind: "pickup"; readonly id: string };

/** Ce que l'affichage sait au moment de juger les conditions (RS8). */
export interface ConditionContext {
  /** Le jour métier de l'affichage, `AAAA-MM-JJ` (Paris). */
  readonly day: string;
  /** L'heure de l'affichage, `HH:MM` (Paris). */
  readonly time: string;
  readonly site: ShopSite;
  /** Le total que le client lit au panier, en centimes ; `null` = pas encore chiffré. */
  readonly cartTotalCents: number | null;
}

/** Ce qu'une condition écarte avant tout déclencheur — l'aperçu le nomme. */
export type ConditionGate =
  "outside_weekdays" | "outside_hours" | "no_site_yet" | "wrong_site" | "cart_below_threshold";

/** Le site d'un jour visé : sans jour visé, pas de site ; sans point, la livraison. */
export function shopSiteOf(target: FulfillmentTarget | null): ShopSite {
  if (target === null) {
    return { kind: "unknown" };
  }
  return target.pickupAddressId === null
    ? { kind: "delivery" }
    : { kind: "pickup", id: target.pickupAddressId };
}

/**
 * **Pourquoi une condition écarte la règle**, ou `null` si elles passent
 * toutes. Une seule raison, la première dans cet ordre : le jour de la
 * semaine, l'heure, le point de retrait, le montant.
 *
 * Le jour et l'heure sont ceux de l'AFFICHAGE, pas du jour visé : « le matin »
 * dit quand le client regarde. Une règle à points de retrait ne s'affiche pas
 * tant que le client n'a rien choisi, ni en livraison. Un montant inconnu
 * n'atteint aucun seuil : on ne montre pas « dès 20 € » sur un panier qu'on
 * n'a pas encore chiffré.
 */
export function conditionGate(
  conditions: SuggestionConditions,
  context: ConditionContext,
): ConditionGate | null {
  if (conditions.weekdays !== null && !conditions.weekdays.includes(weekdayOfDate(context.day))) {
    return "outside_weekdays";
  }
  if (conditions.hours !== null && !hoursCover(conditions.hours, context.time)) {
    return "outside_hours";
  }
  const siteGate = siteGateOf(conditions.pickupAddressIds, context.site);
  if (siteGate !== null) {
    return siteGate;
  }
  const threshold = conditions.minCartTotalCents;
  if (
    threshold !== null &&
    (context.cartTotalCents === null || context.cartTotalCents < threshold)
  ) {
    return "cart_below_threshold";
  }
  return null;
}

function siteGateOf(ids: readonly string[] | null, site: ShopSite): ConditionGate | null {
  if (ids === null) {
    return null;
  }
  if (site.kind === "unknown") {
    return "no_site_yet";
  }
  return site.kind === "pickup" && ids.includes(site.id) ? null : "wrong_site";
}

/**
 * Le panier a-t-il un article de la famille exclue — elle ou l'une de ses
 * sous-familles, comme un déclencheur « famille au panier » ?
 */
export function cartHasExcludedFamily(
  conditions: SuggestionConditions,
  skus: readonly string[],
  familyPaths: ReadonlyMap<string, readonly string[]>,
): boolean {
  const family = conditions.cartWithoutFamilyId;
  return family !== null && skus.some((sku) => familyPaths.get(sku)?.includes(family) === true);
}
