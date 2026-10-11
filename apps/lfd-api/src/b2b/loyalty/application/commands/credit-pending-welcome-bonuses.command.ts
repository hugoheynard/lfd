/**
 * **La passe de nuit du bonus de bienvenue** (plan
 * `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`,
 * lot C) : les personnes devenues un compte depuis que le bonus est allumé,
 * adresse prouvée, sans ligne `welcome`. Elle rattrape un abonné perdu au
 * redémarrage, et la personne dont l'adresse n'a été prouvée qu'après coup.
 */
export class CreditPendingWelcomeBonusesCommand {}

/** Le compte rendu d'un passage — seule observabilité d'un déclenchement machine. */
export interface PendingWelcomeBonusesReport {
  readonly scanned: number;
  readonly credited: number;
}
