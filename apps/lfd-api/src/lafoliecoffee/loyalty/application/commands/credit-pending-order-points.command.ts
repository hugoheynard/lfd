/**
 * **Le rattrapage** : écrire le gain de toutes les commandes définitives qui
 * n'en ont pas encore (plan D3). L'abonné peut échouer — `BackgroundWork`
 * avale son erreur — ; ce passage garantit que le crédit arrive au plus tard
 * au suivant. Rend ce qu'il a parcouru et ce qu'il a écrit.
 */
export class CreditPendingOrderPointsCommand {}

/** Le compte rendu d'un passage — seule observabilité d'un déclenchement machine. */
export interface PendingOrderPointsReport {
  readonly scanned: number;
  readonly credited: number;
}
