/**
 * **« Pour quelle heure les réassorts de ces points sont-ils attendus ? »** —
 * lecture nommée que le réassort publie pour le transfert (H2 du plan
 * `reassort-boutiques/plan-heure-du-reassort.md`, H-D4) : le transfert
 * arrive à la plus tôt des heures de ce qu'il porte, et les commandes la
 * composent avec la leur. Port étroit (ISP) : le seul fait que le transfert
 * lit des réassorts.
 */
export abstract class PlacedResupplyArrivals {
  /**
   * La plus tôt des heures (`HH:MM`) des réassorts « pour demain » ENVOYÉS et
   * non annulés de la journée `day` (`AAAA-MM-JJ`), par point. Un point sans
   * réassort daté est ABSENT : un réassort d'avant l'heure n'avance rien.
   */
  abstract earliestFor(
    day: string,
    siteIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
}
