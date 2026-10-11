/**
 * Créditer **tout de suite** les commandes définitives d'une fiche invité qui
 * vient de devenir un compte (plan
 * `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`,
 * §7 : crédit immédiat, borné au titulaire). Le rattrapage de nuit reste le
 * filet si ce passage échoue. Rend le nombre de gains écrits.
 */
export class CreditClaimedGuestPointsCommand {
  constructor(readonly userId: string) {}
}
