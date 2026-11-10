/**
 * Ce qu'une commande à venir rapporterait — l'assiette telle que le devis la
 * connaît, **hors taxe**, dans les termes mêmes du crédit.
 */
export interface LoyaltyEarningBasis {
  /** La personne connectée, titulaire des points d'un particulier. */
  readonly buyerUserId: string;
  /** Les marchandises hors taxe, avant remise. */
  readonly subtotalCents: number;
  /** La remise du point de retrait, hors taxe. */
  readonly discountCents: number;
  /** La part du bon de fidélité imputée, hors taxe — `0` sans bon. */
  readonly voucherDiscountCents: number;
}

/**
 * **« Vous gagnerez N points »** — ce que le devis connecté demande à la
 * fidélité (plan des points, E1.2).
 *
 * Déclaré par la commande, implémenté par la fidélité avec la fonction même
 * du crédit (`earningFor`), relié dans `appBootstrap/loyalty-voucher.module.ts`.
 * Une règle recopiée ici divergerait au premier changement d'assiette.
 *
 * Réservé au particulier : le devis d'un espace société ne le demande pas
 * (lot F).
 */
export abstract class LoyaltyEarningPreview {
  /** Les points que rapporterait cette commande, ou `null` si elle ne rapporterait rien. */
  abstract pointsToEarn(basis: LoyaltyEarningBasis): Promise<number | null>;
}
