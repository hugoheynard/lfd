/** Une table qu'un geste de remise à blanc du dev supprime (au moins en partie). */
export interface CoveredTable {
  /** `schéma.table`, tel que Postgres le nomme. */
  readonly table: string;
  /** Les tables qui la tiennent par une clé bloquante, retirées avant elle. */
  readonly referencedBy: readonly string[];
}

/** Une table qui en tient une supprimée et que le geste laisse VOLONTAIREMENT. */
export interface CoverageExemption {
  readonly table: string;
  /** La table supprimée qu'elle tient. */
  readonly references: string;
  readonly reason: string;
}
