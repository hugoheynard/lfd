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
   */
  abstract markPaid(paymentIntentId: string): Promise<void>;

  /**
   * Marque **échoué** le règlement de la commande portant cette intention. Même
   * idempotence : ne passe à `failed` que ce qui était `pending`.
   */
  abstract markPaymentFailed(paymentIntentId: string): Promise<void>;

  /**
   * Grave la **remise en main propre** : horodatage, auteur, et passage à
   * `fulfilled`. Rend `false` si la commande était **déjà remise**.
   *
   * L'appelant a déjà appliqué la règle (`handoverBlocker`) sur un état lu juste
   * avant ; ce booléen ne la rejoue pas, il ferme la **course** entre deux
   * comptoirs qui scanneraient le même QR dans la même seconde. La condition
   * `handedOverAt = null` est évaluée par la base, donc exactement une des deux
   * écritures gagne — garantie qu'un `SELECT` puis `UPDATE` applicatif ne peut
   * pas donner.
   */
  abstract markHandedOver(token: string, at: Date, by: string): Promise<boolean>;

  /**
   * Grave une remise **saisie à la main**, par le NUMÉRO de commande.
   *
   * Le cas qu'elle couvre est celui qui ferait sinon enfreindre la règle de
   * l'autoscan : le destinataire n'a pas son courriel — un magasinier, quelqu'un
   * d'autre à l'accueil, un téléphone déchargé. Sans cette porte, quelqu'un
   * proposerait d'imprimer le code sur le colis « pour les livraisons
   * difficiles », et un coursier scannerait son propre carton.
   *
   * Elle grave `handedOverVia: "manual"` : une attestation faible et honnête
   * vaut mieux qu'une attestation forte et fausse, **à condition** de pouvoir
   * les distinguer.
   */
  abstract markHandedOverManually(reference: string, at: Date, by: string): Promise<boolean>;

  /**
   * Grave le **colisage** : la fabrication est finie.
   *
   * Écriture nue et **conditionnée en base** (`readyAt: null`), pour la même
   * raison que `markHandedOver` : deux postes qui scannent la même feuille au
   * même moment ne doivent produire qu'un seul fait. Une load→save y perdrait
   * l'atomicité pour zéro invariant de plus — la règle a déjà été appliquée sur
   * l'état lu, par `packingBlocker`.
   *
   * Rend `false` quand la course est perdue : la commande était déjà prête.
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
