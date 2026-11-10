/**
 * **Le bonus de bienvenue d'une personne qui vient de devenir un compte** —
 * par création ou par rattachement d'une fiche invité (plan
 * `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`,
 * lot C). La passe de nuit reste le filet si ce passage échoue, ou si
 * l'adresse n'est prouvée que plus tard. Rend vrai si le bonus a été écrit.
 */
export class CreditWelcomeBonusCommand {
  constructor(readonly userId: string) {}
}
