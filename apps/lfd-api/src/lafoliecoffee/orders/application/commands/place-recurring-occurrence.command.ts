import type { OccurrenceRefusalCause } from "../../../subscriptions/domain/ports/occurrence-run.ledger.js";

/**
 * Passe **l'échéance d'un panier récurrent** en commande : le panier, et le
 * jour servi (`AAAA-MM-JJ`). C'est la machine qui la passe — le balayage du
 * planificateur —, au nom de l'acheteur que le panier nomme.
 */
export class PlaceRecurringOccurrenceCommand {
  constructor(
    readonly subscriptionId: string,
    readonly date: string,
  ) {}
}

/**
 * Ce que le planificateur a fait de l'échéance.
 *
 * - `generated` : la commande est passée ;
 * - `refused` : refus que le staff peut corriger, rejoué au balayage suivant ;
 *   `newCause` dit si l'alerte doit partir ;
 * - `missed_deadline` : l'heure limite est passée, l'échéance est close ;
 * - `not_due` : le panier ne vise pas ce jour, ou il est hors du périmètre
 *   du planificateur (panier perso, payeur public) ;
 * - `already_closed` : l'échéance était déjà générée ou manquée.
 */
export type PlaceRecurringOccurrenceResult =
  | { readonly kind: "generated"; readonly orderId: string; readonly orderNumber: string }
  | {
      readonly kind: "refused" | "missed_deadline";
      readonly cause: OccurrenceRefusalCause;
      readonly reason: string;
      readonly newCause: boolean;
    }
  | { readonly kind: "not_due" }
  | { readonly kind: "already_closed" };
