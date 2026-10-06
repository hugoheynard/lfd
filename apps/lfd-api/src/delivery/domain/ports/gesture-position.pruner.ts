/**
 * Port de **purge** des positions relevées au geste
 * (`documentation/livraisons/gps-y-aller-et-position.md`, YA-D4). Une interface
 * à part (ISP) : seul le balayage nocturne en dépend, et il n'efface que des
 * COLONNES — l'arrêt clos et l'arrivée restent, avec leur heure.
 */
export abstract class GesturePositionPruner {
  /**
   * Remet à `null` la position d'au plus `limit` arrêts clos avant cet
   * instant ; rend combien. Un compte inférieur à `limit` dit qu'il ne reste
   * plus rien à effacer.
   */
  abstract clearBatchClosedBefore(instant: Date, limit: number): Promise<number>;

  /** Même chose pour la position de « Je suis arrivé », comptée sur l'heure d'arrivée. */
  abstract clearBatchArrivedBefore(instant: Date, limit: number): Promise<number>;
}
