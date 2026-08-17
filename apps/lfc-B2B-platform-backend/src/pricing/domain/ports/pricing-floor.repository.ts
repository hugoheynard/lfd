import type { PricingFloor } from "../entities/pricing-floor.js";

/**
 * Port d'**écriture** des planchers.
 *
 * `pose` est idempotent par portée : l'identifiant étant dérivé de la cible, il
 * n'y a pas de « créer ou mettre à jour ? » à trancher, ni d'appelant qui
 * puisse se tromper de branche.
 */
export abstract class PricingFloorRepository {
  abstract pose(floor: PricingFloor): Promise<void>;

  /**
   * Charge la limite posée sur cette portée, ou `null`.
   *
   * Sert à **confirmer** sans modifier : on relit ce qui existe, on rafraîchit
   * la référence, et on repose à l'identique. Reconstruire la politique côté
   * appelant aurait ouvert la porte à une confirmation qui change quelque chose
   * sans le dire.
   */
  abstract load(id: string): Promise<PricingFloor | null>;

  /** Retire la limite. Rend `false` si aucune n'était posée sur cette portée. */
  abstract remove(id: string): Promise<boolean>;
}
