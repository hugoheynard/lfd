import type { FulfillmentMethod } from "@lfd/contracts";

/**
 * **Ce que le comptoir a le droit de décider lui-même** (plan
 * `documentation/commandes/reliquat/reliquat.md`, §2.2.3 —
 * Hugo, 2026-11-03).
 *
 * Le vendeur du comptoir (`handover_counter:write`) décide d'un départ
 * incomplet sans manager (D1, D2) — mais seulement pour ce qu'il a sous les
 * yeux : un **retrait** de la **journée de service du jour**, c'est-à-dire
 * une commande que la file du comptoir montre (`expectedOn(jour)` filtre sur
 * le jour demandé). Une livraison se décide à l'équipe Commandes ; un autre
 * jour n'a pas de client devant le comptoir.
 *
 * Volontairement séparée de « quel sort pour le reste » : la garde dit QUI
 * peut décider, le sort est un paramètre de la commande — le reliquat (lot
 * R) s'y ajoutera sans rouvrir le droit.
 */
export interface CounterReachSubject {
  readonly fulfillmentMethod: FulfillmentMethod;
  /** Le jour de service au format `AAAA-MM-JJ`, ou `null` (commande sans jour). */
  readonly serviceDay: string | null;
}

/** La phrase d'une livraison : elle ne se décide pas au comptoir. */
export const NOT_A_PICKUP_REASON =
  "Cette commande est une livraison : son départ incomplet ne se décide pas au comptoir. Signalez le manque au colisage ; l'équipe Commandes décidera.";

/**
 * La phrase d'une commande d'un autre jour. Elle n'est pas dans la file du
 * comptoir d'aujourd'hui, et rien ne dit que son client est là.
 */
export function otherDayReason(serviceDay: string | null): string {
  return serviceDay === null
    ? "Cette commande n'a pas de jour de retrait : son départ incomplet ne se décide pas au comptoir. Appelez l'équipe Commandes."
    : `Cette commande est à retirer le ${serviceDay}, pas aujourd'hui : son départ incomplet ne se décide pas au comptoir. Appelez l'équipe Commandes.`;
}

/**
 * Ce qui met la commande **hors de portée** du comptoir, en clair — ou
 * `null` si le comptoir peut décider.
 *
 * @param today le jour de service d'aujourd'hui (`AAAA-MM-JJ`), à l'heure de Paris.
 */
export function counterReachBlocker(subject: CounterReachSubject, today: string): string | null {
  const reach = counterReachOf(subject, today);
  if (reach === "not_a_pickup") {
    return NOT_A_PICKUP_REASON;
  }
  return reach === "other_day" ? otherDayReason(subject.serviceDay) : null;
}

/** Pourquoi la commande est hors de portée du comptoir : une livraison, ou un autre jour. */
export type CounterReachRefusal = "not_a_pickup" | "other_day";

/**
 * Le CAS de {@link counterReachBlocker}, sans sa phrase — l'aperçu du départ
 * incomplet (C1b, 2026-11-03) rend un code, l'écran choisit ses mots.
 * `null` : le comptoir peut décider.
 */
export function counterReachOf(
  subject: CounterReachSubject,
  today: string,
): CounterReachRefusal | null {
  if (subject.fulfillmentMethod !== "pickup") {
    return "not_a_pickup";
  }
  return subject.serviceDay === today ? null : "other_day";
}
