/**
 * **Lire le numéro `pim`** — le journal du référentiel (`pim.pim_change`),
 * alimenté par les déclencheurs des tables de `PIM_VERSIONED_TABLES`, jamais
 * par le code. Séparé du balayage (ISP).
 */
export abstract class PimChangeVersionReader {
  /** Le numéro du journal (`journalVersion`), `0` s'il est vide. Comparé par égalité. */
  abstract versionOf(): Promise<number>;
}
