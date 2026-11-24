import type { Basket } from "../entities/basket.js";

/**
 * Port d'**écriture** des paniers. Séparé de la lecture (ISP).
 *
 * Il prend et rend l'agrégat : on le charge (mur inclus), on le mute par ses
 * méthodes métier, puis on le rend (`save`). Les échéances ont leur propre
 * port (`OccurrenceRepository`), appelé dans la même unité de travail.
 */
export abstract class BasketRepository {
  /** Insère un panier neuf et ses lignes. */
  abstract insert(basket: Basket, at: Date): Promise<void>;

  /**
   * Charge le panier **muré** (acheté par `buyerUserId`), ou `null` s'il
   * n'existe pas, n'est pas au mur, ou est arrêté : un panier arrêté répond
   * comme un panier absent.
   */
  abstract load(basketId: string, buyerUserId: string): Promise<Basket | null>;

  /**
   * Les paniers **vivants** (actifs ou en pause) qui appliquent ce texte de
   * CGV (`salesTerms`, `salesTermsPro`) : ceux à qui annoncer une nouvelle
   * version (plan § 7). Une lecture du bloc pour lui-même, hors mur : elle
   * ne sert à aucun client.
   */
  abstract liveUnderSalesTerms(salesTermsKey: string): Promise<readonly Basket[]>;

  /** Persiste le statut et la planification d'un panier chargé. */
  abstract save(basket: Basket, at: Date): Promise<void>;
}
