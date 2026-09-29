/** Un arrêt vivant, pour la vue. */
export interface RoundStopRow {
  readonly stopId: string;
  readonly orderId: string;
  readonly position: number;
}

/** Une tournée du jour, telle que la vue la lit. */
export interface RoundRow {
  readonly id: string;
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly version: number;
  /** Le retrait du véhicule, pour signaler une tournée sur un véhicule retiré (C14). */
  readonly vehicleRetiredAt: Date | null;
  /** Partie le (lot 4), ou `null`. */
  readonly departedAt: Date | null;
  /** Arrêts vivants (ni retirés, ni clos), dans l'ordre de passage. */
  readonly stops: readonly RoundStopRow[];
}

/**
 * Port de **lecture** de la composition — distinct du port d'écriture (ISP) :
 * la vue du jour n'a pas besoin de l'agrégat.
 */
export abstract class DeliveryRoundsReader {
  /** Les tournées du jour, véhicule par véhicule (ordre de la flotte), puis par passage. */
  abstract roundsOn(serviceDay: string): Promise<readonly RoundRow[]>;

  /** Parmi ces commandes, celles qui sont dans une tournée vivante — de n'importe quel jour (I3). */
  abstract composedAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>>;
}
