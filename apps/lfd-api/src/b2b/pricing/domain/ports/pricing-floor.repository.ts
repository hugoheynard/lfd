import type { PriceScope } from "../price-rule.js";
import type { PricingFloor } from "../entities/pricing-floor.js";
import type { PricingAct } from "../pricing-act.js";

/**
 * Port d'**écriture** des planchers.
 *
 * `pose` est idempotent par portée : l'identifiant étant dérivé de la cible, il
 * n'y a pas de « créer ou mettre à jour ? » à trancher, ni d'appelant qui
 * puisse se tromper de branche.
 *
 * Chaque écriture prend son **acte**, pour la même raison que du côté des règles :
 * un argument obligatoire ne s'oublie pas, un second appel si. L'adaptateur écrit
 * la limite et sa trace dans la même transaction.
 */
export abstract class PricingFloorRepository {
  abstract pose(floor: PricingFloor, act: PricingAct): Promise<void>;

  /**
   * Charge la limite posée sur cette portée, ou `null`.
   *
   * Sert à **confirmer** sans modifier : on relit ce qui existe, on rafraîchit
   * la référence, et on repose à l'identique. Reconstruire la politique côté
   * appelant aurait ouvert la porte à une confirmation qui change quelque chose
   * sans le dire.
   */
  /**
   * **La limite qui arbitre cette portée à cet instant**, ou `null`.
   *
   * ⚠️ Elle s'adressait par identifiant jusqu'au 2026-09-09 — dérivé de la
   * portée, donc unique par cible. Depuis que les planchers sont versionnés, il
   * y a N lignes par portée : c'est la portée **et l'instant** qui désignent.
   * L'écran, lui, ne connaît toujours que la portée.
   */
  abstract inForceFor(scope: PriceScope, at: Date): Promise<PricingFloor | null>;

  /**
   * **Archive** la limite. Rend `false` si aucune n'était posée sur cette portée.
   *
   * Jamais de `DELETE` : une limite a arbitré des prix, et savoir qu'elle
   * existait explique des factures. Elle laisse sa ligne, marquée, et le journal
   * garde la suite complète des décisions prises sur cette portée — c'est là que
   * vit l'histoire, pas dans la table d'état.
   */
  abstract archive(id: string, act: PricingAct): Promise<boolean>;
}
