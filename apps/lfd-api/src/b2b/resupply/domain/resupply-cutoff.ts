/**
 * Port de **lecture** de l'heure limite qui s'oppose à un réassort « pour
 * demain » : l'heure du réassort, « la veille, HH:MM » (Réglages › Commandes
 * › Heure limite ; lot R3a, 2026-10-21). Elle n'est plus l'heure limite
 * générale : le réassort a la sienne, plus tardive par défaut.
 */
export abstract class ResupplyCutoff {
  /**
   * L'instant limite pour cette journée, ou `null` : l'heure n'existe pas ce
   * jour-là (l'heure sautée du passage à l'heure d'été).
   */
  abstract deadlineFor(serviceDay: string): Promise<Date | null>;
}
