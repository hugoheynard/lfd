/** Une impression à balayer : de quoi retrouver son PDF, puis sa ligne. */
export interface StaleProvisionalPrint {
  readonly id: string;
  readonly serviceDay: string;
  readonly run: number;
}

/**
 * **Balayer les impressions provisoires des journées passées** (
 * `documentation/fournil/dossier-prod-du-jour.md`) : le fil
 * d'une journée n'a plus d'usage une fois le jour passé. Le PDF part
 * d'abord, la ligne ensuite — une ligne restée retrouve son fichier la nuit
 * suivante.
 */
export abstract class ProvisionalPrintPruner {
  /** Les impressions des journées strictement antérieures à `day` (`AAAA-MM-JJ`). */
  abstract staleBefore(day: string): Promise<readonly StaleProvisionalPrint[]>;

  /** Retire ces lignes ; rend combien. */
  abstract forget(ids: readonly string[]): Promise<number>;
}
