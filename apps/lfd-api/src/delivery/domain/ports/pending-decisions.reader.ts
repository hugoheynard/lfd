import type { StopDecisionRow } from "./stop-decisions.reader.js";

/** Un arrêt « À décider », tel que la liste du commercial le lit. */
export interface PendingDecisionRow {
  readonly roundId: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly serviceDay: string;
  readonly stopId: string;
  readonly orderId: string;
  /** Figé au départ ; `""` sans instantané. */
  readonly reference: string;
  readonly customerLabel: string;
  readonly signatureRequired: boolean;
  readonly decision: StopDecisionRow;
}

/**
 * Port de **lecture** de la liste « À décider » (`a-la-porte.md`, B3) :
 * les décisions ouvertes ou autorisées dont l'arrêt est encore OUVERT (ni
 * clos, ni retiré) dans une tournée PARTIE et NON RENTRÉE — quel que soit son
 * jour. Par jour, puis tournée et position.
 */
export abstract class PendingDecisionsReader {
  abstract pending(): Promise<readonly PendingDecisionRow[]>;
}
