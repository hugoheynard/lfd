/**
 * Port de **lecture** étroit : un arrêt a-t-il un sac chargé ? Lu par le
 * déplacement (L4-C5) avant d'écrire, pour refuser en le nommant ;
 * `saveMove` le revérifie sous verrou.
 */
export abstract class LoadedStopsReader {
  abstract hasLoadedBag(stopId: string): Promise<boolean>;

  /**
   * Parmi ces arrêts, ceux qui ont au moins un sac chargé — lu par « Proposer »
   * (lot 7, L7-C5) pour ne jamais toucher une tournée où un sac est déjà dans la
   * camionnette.
   */
  abstract loadedAmong(stopIds: readonly string[]): Promise<ReadonlySet<string>>;
}
