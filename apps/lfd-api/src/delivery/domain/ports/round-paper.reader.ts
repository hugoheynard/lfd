import type { PlannedTiming } from "../value-objects/planned-timing.js";
import type { DepartedStopRow } from "./driver-rounds.reader.js";

/** Un arrêt vivant de la tournée à imprimer. */
export interface RoundPaperStopRow {
  readonly stopId: string;
  readonly orderId: string;
  /** L'instantané du départ, ou `null` : au dépôt, la feuille se lit vivante. */
  readonly departed: DepartedStopRow | null;
  /** Les codes courts des bacs non annulés de la commande, dans l'ordre de déclaration. */
  readonly binCodes: readonly string[];
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
