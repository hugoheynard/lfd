/**
 * **« Depuis quand les niveaux de suivi sont-ils en service ? »** — un port,
 * pour que les tests e2e éprouvent le figement d'une journée arrêtée
 * aujourd'hui alors que la valeur de production est encore à venir
 * (`TRACKING_LEVELS_SINCE`).
 */
export abstract class TrackingLevelsCommissioning {
  abstract since(): Date;
}
