/**
 * Port de **lecture** de l'heure limite qui s'oppose à un réassort « pour
 * demain ». L'adaptateur lit la règle générale du commerce et le réglage
 * `resupply_subject_to_cutoff` : une seule règle, pas une seconde.
 */
export abstract class ResupplyCutoff {
  /**
   * L'instant limite pour cette journée, ou `null` : réassort réglé « sans
   * limite », aucune règle posée, ou heure inexistante ce jour-là.
   */
  abstract deadlineFor(serviceDay: string): Promise<Date | null>;
}
