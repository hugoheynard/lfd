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

  /** Retire la limite. Rend `false` si aucune n'était posée sur cette portée. */
  abstract remove(id: string): Promise<boolean>;
}
