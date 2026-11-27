/** Le balayage des cinq minutes : les colonnes des deux prochains jours qui se commandent. */
export class SweepPlannedColumnsCommand {}

/** Ce que le balayage a fait, compté — la route de la machine le rend tel quel. */
export interface PlannerSweepReport {
  /** Les colonnes en brouillon, non vides, lues pour ce passage. */
  readonly due: number;
  readonly placed: number;
  readonly refused: number;
  readonly missed: number;
  /** Les colonnes dont l'instant de conversion a bougé (une limite d'article changée). */
  readonly rescheduled: number;
  /** Les colonnes qu'une erreur technique a interrompues : reprises au prochain passage. */
  readonly failed: number;
}
