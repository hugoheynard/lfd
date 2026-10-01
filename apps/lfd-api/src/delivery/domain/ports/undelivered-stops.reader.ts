/** Un arrêt resté ouvert d'une tournée partie. */
export interface UndeliveredStopRow {
  readonly roundId: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly serviceDay: string;
  readonly stopId: string;
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  readonly departedAt: Date;
  /** Rentrée le (PL2), ou `null` : jamais déclarée rentrée. */
  readonly returnedAt: Date | null;
  readonly arrivedAt: Date | null;
}

/**
 * Port de **lecture** de « Non remis » (`plan-a-la-porte.md`, AP-D7 ;
 * `parcours-du-livreur.md`, PL2) : les arrêts non retirés et non clos des
 * tournées RENTRÉES — quel que soit leur jour —, et ceux des tournées PARTIES
 * d'une journée antérieure à `today`, jamais rentrées. Par jour, puis
 * tournée et position.
 */
export abstract class UndeliveredStopsReader {
  abstract undelivered(today: string): Promise<readonly UndeliveredStopRow[]>;
}
