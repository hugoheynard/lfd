import type { Subscription } from "../entities/subscription.js";

/** Ce que la création renvoie : l'id technique attribué par la base. */
export interface CreatedSubscription {
  readonly id: string;
}

/**
 * Port d'**écriture** des paniers récurrents. Séparé de la lecture (ISP).
 *
 * Il ne prend **jamais** des primitives : on charge l'agrégat (`load`, mur inclus),
 * on le mute par ses méthodes métier, puis on le rend au port (`save`) — l'agrégat
 * est l'unité de persistance, pas une colonne. `create` insère un agrégat neuf
 * (sans id) et renvoie l'id attribué.
 */
export abstract class SubscriptionRepository {
  /** Insère un panier neuf et renvoie son id. */
  abstract create(subscription: Subscription): Promise<CreatedSubscription>;

  /**
   * Charge l'agrégat **muré** (appartenant à `ownerUserId`), avec ses lignes et
   * ses dérogations, ou `null` s'il n'existe pas, n'est pas au mur, ou est
   * arrêté : un panier arrêté répond comme un panier absent.
   */
  abstract load(subscriptionId: string, ownerUserId: string): Promise<Subscription | null>;

  /** Persiste l'état courant d'un agrégat déjà chargé (statut, arrêt compris, et dérogations). */
  abstract save(subscription: Subscription): Promise<void>;
}
