import type { FulfillmentWindow, RecurringDeltaLine } from "@lfd/contracts";

import type { Subscription, SubscriptionRouting } from "../entities/subscription.js";
import type { IsoDate } from "../value-objects/iso-date.js";
import type { SubscriptionLine } from "../value-objects/subscription-line.js";

/** Une échéance à passer en commande, avec tout ce que la commande reprend. */
export interface ServableOccurrence {
  readonly kind: "servable";
  readonly subscriptionId: string;
  readonly date: IsoDate;
  /** Celui qui a ouvert le panier : l'acheteur de la commande. */
  readonly buyerUserId: string;
  readonly companyId: string | null;
  readonly routing: SubscriptionRouting & { readonly window: FulfillmentWindow };
  readonly lines: readonly SubscriptionLine[];
  /** La note de la dérogation de ce jour, sinon celle du panier. */
  readonly note: string;
  /** L'écart avec le gabarit, en quantités ; vide sans dérogation. */
  readonly deltas: { readonly added: RecurringDeltaLine[]; readonly removed: RecurringDeltaLine[] };
}

/**
 * Pourquoi une échéance ne se passe pas :
 *
 * - `not_due` : le panier ne la vise pas ce jour-là (absent, arrêté, en pause,
 *   pas armé ou armé après, hors calendrier, sautée). Rien ne s'inscrit au
 *   registre : ce n'est pas un refus, c'est l'absence d'échéance.
 * - `no_window` : un panier ouvert avant que le créneau soit demandé. C'est
 *   un refus, qui s'inscrit et alerte : le client attend une commande.
 */
export type UnservableOccurrence =
  { readonly kind: "not_due" } | { readonly kind: "no_window"; readonly buyerUserId: string };

/**
 * **L'échéance d'un jour, telle que le planificateur la sert** — ou pourquoi
 * il ne la sert pas. Pure : le statut, la borne basse et le calendrier sont
 * lus sur l'agrégat, rien n'est relu ailleurs.
 */
export function servableOccurrence(
  subscription: Subscription,
  subscriptionId: string,
  date: IsoDate,
): ServableOccurrence | UnservableOccurrence {
  if (subscription.isCancelled || subscription.currentStatus !== "active") {
    return { kind: "not_due" };
  }
  const armedFrom = subscription.armedSince;
  if (armedFrom === null || date.isBefore(armedFrom)) {
    return { kind: "not_due" };
  }
  const [occurrence] = subscription.occurrencesBetween(date, date);
  if (occurrence === undefined) {
    return { kind: "not_due" };
  }
  const routing = subscription.fulfilment;
  const window = routing.window;
  if (window === null) {
    return { kind: "no_window", buyerUserId: subscription.buyerUserId };
  }
  return {
    kind: "servable",
    subscriptionId,
    date,
    buyerUserId: subscription.buyerUserId,
    companyId: subscription.companyId,
    routing: { ...routing, window },
    lines: occurrence.lines,
    note: occurrence.overridden ? occurrence.note : subscription.templateNote,
    deltas: deltasOf(subscription.templateLines, occurrence.lines),
  };
}

/** L'écart, SKU par SKU, entre les lignes du jour et celles du gabarit. */
function deltasOf(
  template: readonly SubscriptionLine[],
  served: readonly SubscriptionLine[],
): ServableOccurrence["deltas"] {
  const quantities = new Map<string, number>();
  for (const line of served) {
    quantities.set(line.sku, (quantities.get(line.sku) ?? 0) + line.quantity);
  }
  for (const line of template) {
    quantities.set(line.sku, (quantities.get(line.sku) ?? 0) - line.quantity);
  }
  const added: RecurringDeltaLine[] = [];
  const removed: RecurringDeltaLine[] = [];
  for (const [sku, difference] of quantities) {
    if (difference > 0) {
      added.push({ sku, quantity: difference });
    } else if (difference < 0) {
      removed.push({ sku, quantity: -difference });
    }
  }
  return { added, removed };
}
