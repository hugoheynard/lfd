import type { Order } from "../entities/order.js";
import type { HandoverVia } from "../services/handover.js";

/** Ce que la passation renvoie : l'id technique et le numéro humain. */
export interface PlacedOrder {
  readonly id: string;
  readonly orderNumber: string;
}

/**
 * Ce qu'un abandon a écrit : la commande annulée (clientèle publique), ou son
 * seul règlement tombé (pro, reprenable jusqu'à la clôture).
 */
export type AbandonedSettlement = "cancelled" | "failed";

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
  /**
   * Crée la commande et ses lignes en une transaction.
   *
   * ⚠️ **Elle rejoint l'unité de travail ambiante** quand il y en a une
   * (`transactionalPrisma`), et c'est ce que le handler client exploite : la
   * commande et la résolution de sa clé d'idempotence partent ensemble, ou
   * aucune des deux. L'intervalle entre les deux serait le seul état que le
   * dispositif ne survit pas — la commande existe, la clé n'est pas résolue :
   * ni rendable, ni reprenable.
   */
  abstract place(order: Order): Promise<PlacedOrder>;

  /**
   * Marque **payée** la commande portant cette intention Stripe. **Idempotent** :
   * ne touche que les commandes encore `pending` (déjà `paid`, ou intent inconnu ⇒
   * no-op) — Stripe peut réémettre l'événement.
   *
   * 🔴 **Rend l'identifiant de la commande FRANCHIE, ou `null`** (2026-09-17).
   * Elle rendait `void`, et c'est ce qui rendait le fait impossible à publier :
   * l'appelant savait qu'il avait demandé une bascule, jamais si elle avait eu
   * lieu ni sur quoi. Le `null` porte donc une information précise — « aucune
   * ligne n'était encore en vol » —, et c'est LUI qui interdit deux courriels
   * pour un seul paiement quand Stripe réémet.
   */
  abstract markPaid(paymentIntentId: string): Promise<string | null>;

  /**
   * Marque **échoué** le règlement de la commande portant cette intention. Même
   * idempotence : ne passe à `failed` que ce qui était `pending`.
   *
   * 🔴 Rend l'identifiant franchi, ou `null` — même raison que {@link markPaid},
   * et le même enjeu : c'est ce retour qui permet de prévenir le client d'un
   * refus, ce que le système ne faisait pas du tout.
   */
  abstract markPaymentFailed(paymentIntentId: string): Promise<string | null>;

  /**
   * **L'abandon du règlement par son client** — il quitte l'écran de carte
   * (plan `documentation/order/plan-abandon-du-reglement.md`, D1, D4, Q3).
   *
   * 🔴 **Écriture nue, conditionnée en base, et c'est voulu** — au même titre
   * que {@link markPaid} : `Order` est un agrégat de PASSATION qui ne sait pas
   * se recharger, et la règle tient entière dans le `where` (`status: placed`,
   * règlement non encaissé). Une load→save y perdrait l'atomicité face au
   * webhook d'encaissement pour zéro invariant de plus. Ne pas « corriger » :
   * lire.
   *
   * L'effet dépend de la clientèle **figée** sur la commande :
   *
   * - `public` → `status = cancelled` **et** `paymentStatus = failed`, depuis
   *   une attente ou un refus : une commande abandonnée est un règlement mort,
   *   et le rejeu de passation la voit comme telle sans condition de plus (Q3) ;
   * - `pro`, ou clientèle inconnue (`NULL`, commande d'avant la distinction) →
   *   `paymentStatus = failed` seul, depuis une attente : la commande reste
   *   `placed` et se reprend jusqu'à la clôture (D4).
   *
   * @returns `cancelled` ou `failed` selon ce qui a été ÉCRIT, `null` si rien
   * n'a franchi (second clic, commande déjà encaissée, refus déjà posé).
   * C'est ce `null` qui interdit de publier deux fois le même fait.
   */
  abstract markAbandoned(orderId: string): Promise<AbandonedSettlement | null>;

  /**
   * **La clôture coupe un règlement resté en l'air** : `cancelled` + `failed`,
   * pour TOUTES les clientèles (Q7), depuis une attente ou un refus.
   *
   * Même justification d'écriture nue que {@link markAbandoned}. Rend `true`
   * si la ligne a franchi — l'appelant publie lui-même le fait : `FAILED_FROM`
   * ne franchirait pas une commande déjà refusée (§9 bis, mineurs).
   *
   * Son seul appelant est le balayage de la clôture, `PendingSettlementSweep`
   * (lot 6, vérifié le 2026-09-26).
   */
  abstract failAtClosing(orderId: string): Promise<boolean>;

  /**
   * Recopie la remise **annoncée par le fournil** et ferme la commande.
   *
   * 🔴 Ce n'est plus le commerce qui constate : `markHandedOver` et
   * `markHandedOverManually` écrivaient le fait, sur un scan reçu par une route
   * d'ici. Depuis le 2026-09-07 c'est la production qui l'observe et le grave
   * chez elle ; cette méthode **recopie** ce qu'elle annonce, exactement comme
   * une `OrderLine` porte le snapshot d'un SKU du référentiel.
   *
   * L'instant et l'auteur viennent donc du FAIT, pas d'une horloge d'ici : la
   * remise a eu lieu au comptoir du fournil, et c'est cette heure-là qui compte.
   *
   * ⚠️ **Écriture conditionnée, donc idempotente** : `handedOverAt: null` dans
   * le `where`. Le bus vit en processus et n'est pas rejoué, mais un abonné
   * appelé deux fois ne doit pas réécrire une attestation — la première est la
   * seule vraie. Rend `false` si elle était déjà là.
   */
  abstract markFulfilled(
    reference: string,
    at: Date,
    by: string,
    via: HandoverVia,
  ): Promise<boolean>;

  /**
   * Grave le **colisage** : la fabrication est finie.
   *
   * Écriture nue et **conditionnée en base**, pour la même raison que
   * `markHandedOver` : deux postes qui scannent la même feuille au même moment
   * ne doivent produire qu'un seul fait. Une load→save y perdrait l'atomicité
   * pour zéro invariant de plus.
   *
   * 🔴 La condition portait sur `readyAt: null` **et rien d'autre** — c'était la
   * seule des quatre écritures d'état à laisser sa règle métier au handler. Une
   * commande annulée, en brouillon ou déjà remise ne peut plus devenir `ready` :
   * la base refuse, `packingBlocker` ne fait plus que le DIRE joliment.
   *
   * Rend `false` quand l'écriture n'a pas eu lieu : course perdue, ou état qui
   * ne permet pas le colisage. L'appelant qui veut distinguer les deux lit
   * l'état — c'est ce que fait le handler pour nommer la cause.
   */
  abstract markReady(reference: string, at: Date, by: string): Promise<boolean>;

  /**
   * **Le plan du soir absorbe une journée** : toutes ses commandes `placed`
   * passent `confirmed`, d'un coup.
   *
   * Une seule écriture d'ensemble et non une boucle de `load`/`save` : il n'y a
   * pas d'invariant par commande à protéger — la règle porte sur l'ÉTAT, elle
   * est la même pour toutes, et elle a déjà été nommée (`absorbedByPlan`). Une
   * boucle transformerait une bascule de journée en cinquante décisions
   * individuelles, ce que ce mécanisme existe précisément pour éviter.
   *
   * Rend le **nombre** de commandes absorbées. Zéro sur une seconde clôture :
   * la condition d'état rend l'opération idempotente sans garde ajouté.
   */
  abstract absorbIntoPlan(serviceDay: string, at: Date): Promise<number>;
}
