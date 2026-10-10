import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { OrderSettlementPayloadError } from "../errors/order-settlement-payload.error.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const ORDER_PAYMENT_FAILED = "order.payment_failed";

/**
 * Pourquoi un règlement est mort — chacun appelle un message différent :
 *
 * - `refused` — la banque a refusé la carte (webhook Stripe). La commande reste
 *   `placed` et se reprend sur la même intention ;
 * - `abandoned` — le client a quitté l'écran de règlement. Il vient de cliquer :
 *   aucun courriel ne lui apprend ce qu'il sait déjà ;
 * - `day_closed` — la clôture de la journée a coupé un règlement resté en
 *   l'air : la commande est annulée, pour toutes les clientèles (Q7) ;
 * - `expired` — une commande boutique non réglée a dépassé son délai
 *   (`UNSETTLED_SHOP_ORDER_TTL_MINUTES`) : annulée avec son intention ;
 * - `replaced` — le même particulier a passé une nouvelle commande boutique :
 *   la précédente, non réglée, est annulée avec son intention.
 *
 * `expired` et `replaced` n'appellent AUCUN courriel (plan
 * `documentation/order/commande-carte-reglee.md`, §4.2) : la personne a
 * quitté la page ou relancé elle-même. Ils ne concernent que la clientèle
 * `public`, donc ne sonnent pas non plus.
 */
export type PaymentFailureCause = "refused" | "abandoned" | "day_closed" | "expired" | "replaced";

const PAYMENT_FAILURE_CAUSES: readonly PaymentFailureCause[] = [
  "refused",
  "abandoned",
  "day_closed",
  "expired",
  "replaced",
];

function isPaymentFailureCause(value: unknown): value is PaymentFailureCause {
  return PAYMENT_FAILURE_CAUSES.some((cause) => cause === value);
}

/**
 * Fait de domaine : **le règlement d'une commande est mort**.
 *
 * 🔴 **Ce fait n'existait pas, et son absence coûtait deux choses** (Hugo,
 * 2026-09-17). Le dépôt écrivait `failed` dans une colonne que personne ne
 * relisait : le client n'était averti de rien — il avait même reçu, à la
 * passation, un courriel lui annonçant que sa commande entrait en fabrication —
 * et le comptoir continuait de l'attendre.
 *
 * ⚠️ Comme son jumeau `order.paid`, il n'est publié qu'au
 * **franchissement** : un webhook rejoué ou un second clic ne bascule aucune
 * ligne, donc ne prévient pas deux fois.
 *
 * 🔴 **Il porte sa cause depuis le 2026-09-26.** Son JSDoc disait qu'il ne
 * couvrait pas l'abandon d'une carte — fermer l'onglet n'émet rien chez
 * Stripe — et que fermer ce cas était « un autre chantier » : c'est le plan
 * `documentation/order/plan-abandon-du-reglement.md`. L'abandon et la clôture
 * de la journée le publient désormais eux-mêmes, avec leur cause ; les abonnés
 * (courriel, cloche) choisissent sur elle. Un onglet fermé SANS cliquer ne
 * publie toujours rien — c'est la clôture qui le rattrape.
 *
 * 🔴 **Durable depuis le 2026-10-10 (lot E4b)**
 * (`documentation/journalisation/plan-evenements-durables.md`). Il partait en
 * mémoire APRÈS la bascule : un redémarrage entre les deux perdait le
 * courriel de refus ou la cloche du règlement pro, sans témoin — la commande
 * était `failed`, et rien ne rejouait l'annonce. Il s'écrit désormais dans
 * l'unité de travail qui bascule la commande. Clé
 * `order.payment_failed:<orderId>:<cause>` : celle de la cloche, qui est déjà
 * par commande ET par cause.
 */
export class OrderPaymentFailedEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly cause: PaymentFailureCause,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_PAYMENT_FAILED,
      key: `${ORDER_PAYMENT_FAILED}:${this.orderId}:${this.cause}`,
      payload: { orderId: this.orderId, cause: this.cause },
    };
  }

  /**
   * @throws {OrderSettlementPayloadError} payload hors forme, ou cause hors de
   *   `PaymentFailureCause` — faute d'émetteur.
   */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderPaymentFailedEvent {
    const orderId = payload["orderId"];
    const cause = payload["cause"];
    if (typeof orderId !== "string" || orderId.length === 0 || !isPaymentFailureCause(cause)) {
      throw new OrderSettlementPayloadError(ORDER_PAYMENT_FAILED);
    }
    return new OrderPaymentFailedEvent(orderId, cause);
  }
}
