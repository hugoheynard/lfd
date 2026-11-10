import type { AbandonedSettlement } from "../ports/order.repository.js";

/**
 * Fait de domaine : **le client a abandonné le règlement de sa commande**.
 *
 * Distinct d'{@link OrderPaymentFailedEvent} (cause `abandoned`), publié par le
 * même geste : celui-là dit qu'un règlement est MORT et fait parler le
 * courriel et la cloche ; celui-ci dit qu'une PERSONNE a agi, et entre au
 * journal. Une annulation qui ne vivrait que sur la colonne `status`, qu'on
 * peut réécrire, n'atteste rien.
 */
export class OrderAbandonedEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    /** L'auteur, seul à pouvoir abandonner (Q2) — le sujet de la trace. */
    readonly placedByUserId: string,
    /** Ce que l'abandon a écrit : annulée (public), ou règlement tombé (pro). */
    readonly outcome: AbandonedSettlement,
  ) {}
}
