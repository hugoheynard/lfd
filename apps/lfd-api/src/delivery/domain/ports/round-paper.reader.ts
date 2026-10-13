import type { PlannedTiming } from "../value-objects/planned-timing.js";
import type { DepartedStopRow } from "./driver-rounds.reader.js";

/** Un arrêt vivant de la tournée à imprimer. */
export interface RoundPaperStopRow {
  readonly stopId: string;
  readonly orderId: string;
  /** Sa place dans la séquence ENTIÈRE de la tournée, transferts compris. */
  readonly position: number;
  /** L'instantané du départ, ou `null` : au dépôt, la feuille se lit vivante. */
  readonly departed: DepartedStopRow | null;
  /** Les codes courts des bacs non annulés de la commande, dans l'ordre de déclaration. */
  readonly binCodes: readonly string[];
}

/** Un arrêt de transfert vivant de la tournée à imprimer (2026-10-13). */
export interface RoundPaperTransferStopRow {
  readonly stopId: string;
  readonly transferId: string;
  readonly position: number;
}

/** La tournée à imprimer, telle que l'adaptateur la lit. */
export interface RoundPaperRow {
  readonly id: string;
  readonly serviceDay: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly driverStaffId: string | null;
  /** L'horaire prévu (I10), ou `null`. */
  readonly planned: PlannedTiming | null;
  /** Arrêts vivants (ni retirés, ni clos), dans l'ordre de composition — celui de l'écran. */
  readonly stops: readonly RoundPaperStopRow[];
  /** Les arrêts de transfert vivants, par position — à intercaler avec `stops`. */
  readonly transferStops: readonly RoundPaperTransferStopRow[];
}

/**
 * Port de **lecture** de la tournée à imprimer (Livraison → Tournées,
 * « Imprimer ») — distinct de la lecture du jour et de celle du livreur
 * (ISP) : ni mur du livreur ici, la route est sous `delivery_rounds`, ni
 * version ; mais l'instantané du départ et les codes des bacs.
 */
export abstract class RoundPaperReader {
  /** La tournée, ou `null` : aucune sous cet identifiant. */
  abstract roundOf(roundId: string): Promise<RoundPaperRow | null>;
}
