/**
 * Les étiquettes d'une mesure : des catégories courtes et bornées, jamais une
 * donnée nominative (ni client, ni article, ni montant). Une étiquette à
 * valeurs libres ferait de la fenêtre un journal, et d'un écran de santé une
 * fuite.
 */
export type TimingLabels = Readonly<Record<string, string>>;

/**
 * Port **TimingRecorder** — « ce calcul a pris tant de millisecondes ».
 *
 * Technique pur : il ne sait rien de ce qu'on mesure. Le producteur nomme la
 * mesure (`pricing.resolve`), le lecteur la relit par ce nom ; aucun des deux
 * n'importe l'autre (CLAUDE.md §3 : `ops` n'importe aucun bloc métier).
 *
 * Séparé de sa lecture ({@link TimingWindowReader}) : un producteur n'a pas à
 * pouvoir relire ce que les autres ont mesuré (ISP).
 */
export abstract class TimingRecorder {
  /**
   * Retient une mesure. Ne lève jamais : une sonde qui ferait échouer ce
   * qu'elle mesure serait pire que pas de sonde.
   *
   * @param size la taille du travail mesuré (articles d'un lot…), pour que la
   *   durée se lise rapportée à ce qu'elle a traité.
   */
  abstract record(name: string, labels: TimingLabels, ms: number, size: number): void;
}
