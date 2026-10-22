import type { ProducibleOrder } from "../../channels/commerce/day-orders.reader.js";
import type { PlacedResupply } from "../../channels/commerce/day-resupplies.reader.js";
import {
  ResupplyAlreadyLaunchedError,
  ResupplyLaunchOnUnarrestedPlanError,
} from "../errors/resupply-launch-errors.js";
import { freezeResupply } from "../services/production-count.js";
import type { LaunchedResupplySnapshot } from "./production-day.snapshot.js";

/**
 * **Ce que l'arrêt du plan figerait aujourd'hui** — lu par l'appelant pour un
 * lancement sur une journée qui n'est pas arrêtée (Q5 du plan
 * `reassort-boutiques/plan-au-plus-tot.md`) : les commandes du commerce, les
 * retraits de l'annulation staff, et les réassorts « pour demain » envoyés.
 */
export interface PendingPlan {
  readonly orders: readonly ProducibleOrder[];
  readonly withdrawn: ReadonlySet<string>;
  readonly resupplies: readonly PlacedResupply[];
}

/** Une journée arrêtée : l'arrêt a déjà tout figé, il ne reste rien en attente. */
export const NOTHING_PENDING: PendingPlan = {
  orders: [],
  withdrawn: new Set<string>(),
  resupplies: [],
};

/** Le geste « Lancer » : l'instant du `Clock`, qui, et son nom figé maintenant. */
export interface ResupplyLaunchGesture {
  readonly at: Date;
  readonly staffUserId: string;
  readonly name: string | null;
}

/** Un même réassort ne se lance qu'une fois : deux lancements le compteraient deux fois. */
export function assertNotLaunched(
  serviceDay: string,
  launched: readonly LaunchedResupplySnapshot[],
  resupplyId: string,
): void {
  if (launched.some((resupply) => resupply.resupplyId === resupplyId)) {
    throw new ResupplyAlreadyLaunchedError(serviceDay);
  }
}

/**
 * Q5 — « Lancer » ouvre arrêtée une journée JAMAIS arrêtée, avec ce seul
 * réassort. La décision suppose la journée vide (pas d'arrêt faute de
 * commande ni de réassort du soir) : si l'arrêt avait encore quelque chose à
 * figer, l'ouvrir ainsi laisserait ces commandes hors du plan, et le
 * prochain arrêt ne ferait plus que réannoncer. On refuse donc, et le refus
 * dit d'arrêter le plan d'abord.
 */
export function assertNothingElseToFreeze(serviceDay: string, pending: PendingPlan): void {
  const orders = pending.orders.filter((order) => !pending.withdrawn.has(order.orderId));
  if (orders.length > 0 || pending.resupplies.length > 0) {
    throw new ResupplyLaunchOnUnarrestedPlanError(serviceDay);
  }
}

/** Le réassort recopié tel qu'il est lancé, avec son instant et son auteur. */
export function launchedOf(
  resupply: PlacedResupply,
  gesture: ResupplyLaunchGesture,
): LaunchedResupplySnapshot {
  return {
    ...freezeResupply(resupply),
    launched: { at: gesture.at, by: gesture.staffUserId },
  };
}
