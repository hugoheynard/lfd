/**
 * **L'heure limite du réassort pour demain** — « la veille, HH:MM », telle
 * que le commerce la règle (Réglages › Commandes › Heure limite ; lot R3a,
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md` §13.3).
 *
 * Le fournil en a besoin parce que **le plan s'arrête à la plus tardive** de
 * cette heure et de la fin du rattrapage de l'heure limite générale : un seul
 * compte total, une seule feuille. Lecteur voisin d'`OrderCutoffRulesReader`
 * plutôt qu'une méthode de plus sur lui (ISP) : ce n'est pas une heure de
 * commande, et les règles servies au fournil n'en sont pas changées.
 */
export abstract class ResupplyCutoffTimeReader {
  /** `HH:MM`, la veille de la journée servie, heure de Paris. */
  abstract eveTime(): Promise<string>;
}
