import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Les commandes pour le jour même ne sont pas ouvertes** — refus métier
 * (409), décidé par le réglage admin « Autoriser les commandes pour le jour
 * même » (plan `documentation/commandes/passation/plan-reglages-commandes.md` §8.3,
 * Hugo 2026-10-14). Une journée déjà passée l'est a fortiori.
 *
 * Le message nomme le geste de sortie : une journée à partir de demain.
 */
export class SameDayOrderClosedError extends BusinessError {
  constructor(readonly fulfillmentDate: string) {
    super(
      "orders.same_day_closed",
      "Les commandes pour le jour même ne sont pas ouvertes : choisissez une journée à partir de demain.",
    );
  }
}
