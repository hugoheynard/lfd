/**
 * Port de **lecture** étroit : un arrêt a-t-il un sac chargé ? Lu par le
 * déplacement (L4-C5) avant d'écrire, pour refuser en le nommant ;
 * `saveMove` le revérifie sous verrou.
 */
export abstract class LoadedStopsReader {
  abstract hasLoadedBag(stopId: string): Promise<boolean>;
}
