import type { Order } from "../entities/order.js";

/** Ce que la passation renvoie : l'id technique et le numéro humain. */
export interface PlacedOrder {
  readonly id: string;
  readonly orderNumber: string;
}

/**
 * Port d'**écriture** des commandes.
 *
 * `place` prend l'**agrégat** (déjà validé et calculé — l'adaptateur lit son
 * `toPersistence()`), jamais des primitives calculées par le handler.
 *
 * `markPaid`/`markPaymentFailed` restent des transitions **idempotentes keyées par
 * l'intention Stripe** : la règle « seul `pending` bascule » est appliquée
 * atomiquement en base (`where paymentStatus = pending`). C'est volontairement
 * traité comme une **projection d'événement** (webhook rejouable), pas comme une
 * mutation d'agrégat chargé : la load→save perdrait l'atomicité pour zéro invariant
 * de plus. Le seul point du système où l'écriture nue est le bon outil.
 */
export abstract class OrderRepository {
  /** Crée la commande et ses lignes en une transaction. */
  abstract place(order: Order): Promise<PlacedOrder>;

  /**
   * Marque **payée** la commande portant cette intention Stripe. **Idempotent** :
   * ne touche que les commandes encore `pending` (déjà `paid`, ou intent inconnu ⇒
   * no-op) — Stripe peut réémettre l'événement.
   */
  abstract markPaid(paymentIntentId: string): Promise<void>;

  /**
   * Marque **échoué** le règlement de la commande portant cette intention. Même
   * idempotence : ne passe à `failed` que ce qui était `pending`.
   */
  abstract markPaymentFailed(paymentIntentId: string): Promise<void>;
}
