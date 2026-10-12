/**
 * Ce que l'automatisme sait des clôtures passées d'une entité, pour dire si
 * l'une d'elles a été **manquée** (plan
 * `documentation/comptabilite/facturation/plan-rythme-de-facturation.md`, §14,
 * lot R4b).
 */
export interface AutopilotCoverage {
  /** La mise en service du prélèvement (`collection_floor`), `null` si absente. */
  readonly floorAt: Date | null;
  /** Les clôtures déjà tentées par l'automatisme, quelle qu'en soit l'issue. */
  readonly attemptedClosures: readonly Date[];
  /** La clôture du dernier lot vivant (non annulé), automatique ou manuel. */
  readonly lastLiveBatchClosesAt: Date | null;
}

/**
 * Port de **lecture** du passage automatique : séparé de
 * `CollectionAutopilotRuns`, qui prend et tranche une tentative — ce port
 * n'écrit rien (ISP).
 */
export abstract class AutopilotCoverageReader {
  /**
   * Les tentatives strictement avant `before`, et le dernier lot vivant clos
   * au plus tard à `before` — un lot préparé à la main sur la clôture tentée
   * la couvre déjà.
   */
  abstract coverageOf(legalEntityId: string, before: Date): Promise<AutopilotCoverage>;
}
