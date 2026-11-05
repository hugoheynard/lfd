/**
 * Port **CacheOutcomeRecorder** — « ce cache vient de servir de telle façon ».
 *
 * Technique pur : il ne connaît ni le principal, ni le rayon, ni les prix. Le
 * producteur nomme son cache (`principal`) et l'issue (`memory`, `miss`…) ;
 * `ops` relit le tout par {@link CacheOutcomeReader} sans importer personne
 * (CLAUDE.md §3 : `ops` ne lit que `platform`). Séparé de sa lecture (ISP) :
 * un cache n'a pas à relire ce que les autres ont compté.
 *
 * Les deux chaînes sont des **étiquettes bornées**, jamais une donnée de la
 * personne : une issue à valeurs libres ferait du compteur un journal.
 */
export abstract class CacheOutcomeRecorder {
  /** Compte une issue. Ne lève jamais : une sonde ne fait pas échouer ce qu'elle mesure. */
  abstract record(cache: string, outcome: string): void;
}
