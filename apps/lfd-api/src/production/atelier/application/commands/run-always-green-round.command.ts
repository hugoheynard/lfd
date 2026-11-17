/**
 * **Un tour de la fournée automatique** — le passage du cron du Worker,
 * toutes les cinq minutes (
 * `documentation/fournil/les-niveaux-de-suivi.md`). Sans argument :
 * aujourd'hui et demain se lisent sur le `Clock`, à l'heure de Paris.
 */
export class RunAlwaysGreenRoundCommand {}

/** Ce que le tour a fait d'une journée. */
export interface AlwaysGreenDayReport {
  /** `AAAA-MM-JJ`. */
  readonly serviceDay: string;
  /** `false` : la journée n'est pas arrêtée, rien n'a été touché. */
  readonly arrested: boolean;
  /** Les SKU qui ont reçu une fournée automatique. */
  readonly recorded: readonly string[];
  /** Les SKU sans palier à heure : à confirmer dans la Supervision. */
  readonly toConfirm: readonly string[];
  /** Les SKU dont le passage a levé : journalisés, les autres ont continué. */
  readonly failed: readonly string[];
  /** La journée entière n'a pas pu être lue ou figée (journalisé) ; `null` sinon. */
  readonly error: string | null;
}

export interface AlwaysGreenRoundReport {
  readonly days: readonly AlwaysGreenDayReport[];
}
