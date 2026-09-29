/**
 * Port de **lecture** des tournées d'un véhicule, pour le seul retrait (C14) —
 * distinct du port d'écriture de la composition (ISP).
 */
export abstract class VehicleRoundsReader {
  /**
   * Les jours (`AAAA-MM-JJ`, croissants, sans doublon) STRICTEMENT après
   * `afterDay` où ce véhicule porte une tournée vivante — au moins un arrêt ni
   * retiré ni clos. Une tournée vidée ne retient pas le véhicule : elle ne se
   * supprime pas, elle l'aurait retenu pour toujours.
   */
  abstract liveDaysAfter(vehicleId: string, afterDay: string): Promise<readonly string[]>;
}
