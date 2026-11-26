/** Une issue rangée, telle que l'écran la montre. */
export interface RecapRunView {
  readonly month: string;
  readonly recapId: string | null;
  readonly attemptedAt: Date;
}

/** Les issues d'un payeur : ses mois vides, et ceux qui ne sont pas manqués. */
export abstract class InHouseRecapRunsReader {
  abstract runsOf(payerId: string): Promise<readonly RecapRunView[]>;
}
