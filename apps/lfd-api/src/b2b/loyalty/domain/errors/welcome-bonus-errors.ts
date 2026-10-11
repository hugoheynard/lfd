import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus propres au **bonus de bienvenue** (plan
 * `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`).
 * À part de `loyalty-errors.ts`, déjà au-delà de la taille d'un fichier.
 */

/**
 * Un bonus écrit au livre d'une société, ou d'un montant nul, négatif ou
 * fractionnaire — **400**. La base le refuserait aussi (`CHECK` de forme),
 * sans dire pourquoi.
 */
export class InvalidWelcomeBonusEntryError extends DomainError {
  constructor(points: number) {
    super(
      "loyalty.invalid_welcome_bonus_entry",
      `Bonus de bienvenue invalide (${String(points)} points) : il se crédite à une personne, jamais à une société, pour un nombre entier de points, au moins 1.`,
    );
  }
}

/**
 * La personne a déjà sa ligne `welcome` — **409**. Levé par le dépôt quand
 * l'index unique `(user_id) WHERE kind = 'welcome'` refuse une seconde ligne
 * qu'un passage concurrent vient d'écrire. Le crédit le lit comme « déjà
 * fait » : il n'atteint ni un écran, ni un client.
 */
export class WelcomeBonusAlreadyCreditedError extends BusinessError {
  constructor(userId: string) {
    super(
      "loyalty.welcome_bonus_already_credited",
      `Le bonus de bienvenue de la personne ${userId} est déjà crédité : il ne se reçoit qu'une fois, rien n'a été écrit de plus.`,
    );
  }
}
