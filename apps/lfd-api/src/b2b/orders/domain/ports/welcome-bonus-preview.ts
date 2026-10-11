/**
 * **« N points vous sont offerts »** — ce que la confirmation d'une commande
 * invité demande à la fidélité : le bonus de bienvenue que la personne
 * recevrait en créant son compte MAINTENANT (plan
 * `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`,
 * lot D).
 *
 * Un port à part de {@link LoyaltyEarningPreview}, et non une méthode de plus :
 * le devis connecté ne le demande pas, et n'a pas à en dépendre (ISP).
 * Déclaré par la commande, implémenté par la fidélité avec la règle même du
 * crédit (`welcomeBonusFor`), relié dans `appBootstrap/loyalty-voucher.module.ts`.
 */
export abstract class WelcomeBonusPreview {
  /**
   * Le bonus d'une personne qui deviendrait un compte à adresse prouvée
   * maintenant, ou `null` : programme fermé au public, bonus éteint.
   */
  abstract pointsOnJoining(): Promise<number | null>;
}
