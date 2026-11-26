/** L'issue d'un passage pour un (payeur, mois). `recapId` nul : le mois était vide. */
export interface InHouseRecapRun {
  readonly id: string;
  readonly payerId: string;
  readonly month: string;
  readonly recapId: string | null;
  readonly attemptedAt: Date;
}

/**
 * **Une issue par (payeur, mois)** (`plan-restaurants-maison.md`, D9), tenue
 * par l'unicité de `in_house_recap_run`. `claim` l'écrit dans la transaction
 * de l'émission : `false` si une issue existe déjà, et le passage se tait.
 */
export abstract class InHouseRecapRuns {
  abstract claim(run: InHouseRecapRun): Promise<boolean>;
}
