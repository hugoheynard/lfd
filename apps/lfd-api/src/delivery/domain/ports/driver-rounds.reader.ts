import type {
  BillingAddressPayload,
  DeliveryContact,
  DoorstepRule,
  GpsPoint,
} from "@lfd/contracts";

import type { DepartureWindow } from "../entities/departure-sheet.js";

/** Une de mes tournées, résumée. */
export interface DriverRoundSummaryRow {
  readonly id: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly departedAt: Date | null;
  readonly stopCount: number;
}

/** Ce que le départ a figé pour un arrêt — l'instantané `delivery_stop_execution`. */
export interface DepartedStopRow {
  readonly reference: string;
  readonly customerLabel: string;
  readonly address: BillingAddressPayload | null;
  readonly contact: DeliveryContact | null;
  readonly window: DepartureWindow | null;
  readonly signatureRequired: boolean;
  readonly note: string;
  readonly addressNote: string | null;
  /** `null` : parti avant que le départ ne fige le rang (MT-D5 v2). */
  readonly departureRank: number | null;
  readonly gps: GpsPoint | null;
  /** « Dépôt autorisé », figé au départ (AP-D5) ; `false` avant la migration qui l'a ajouté. */
  readonly depositAllowed: boolean;
  /** La décision réglée d'avance, résolue et figée au départ (B3 bis) ; `ask` avant la migration. */
  readonly doorstepRule: DoorstepRule;
  /** « Je suis arrivé » (AP-D6), ou `null`. */
  readonly arrivedAt: Date | null;
}

/** Un arrêt non retiré de ma tournée. */
export interface DriverStopRow {
  readonly stopId: string;
  readonly orderId: string;
  readonly position: number;
  readonly closedAt: Date | null;
  /** L'instantané du départ, ou `null` : au dépôt. */
  readonly departed: DepartedStopRow | null;
  /** Les bacs non annulés de la commande, et parmi eux les isothermes. */
  readonly bins: number;
  readonly coldBins: number;
}

/** Ma tournée, telle que la vue du livreur la lit. */
export interface DriverRoundRow {
  readonly id: string;
  readonly serviceDay: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly version: number;
  readonly departedAt: Date | null;
  /** Rentrée le (« Tournée terminée », PL2), ou `null`. */
  readonly returnedAt: Date | null;
  /** Par position de composition — la vue choisit l'ordre (rang figé ou position). */
  readonly stops: readonly DriverStopRow[];
}

/**
 * Port de **lecture** des tournées du livreur (plan « Ma tournée », MT-D3 v2).
 *
 * 🔴 **Le mur est dans la requête** : les deux méthodes portent
 * `driver_staff_id = staffUserId` dans LE MÊME `where` — une tournée d'un autre
 * livreur n'existe pas ici, ni dans la liste ni dans le détail, et un 404 sur
 * le détail ne peut pas contredire la liste.
 */
export abstract class DriverRoundsReader {
  /** Mes tournées d'un jour, véhicule par véhicule (ordre de la flotte), puis par passage. */
  abstract roundsOf(staffUserId: string, day: string): Promise<readonly DriverRoundSummaryRow[]>;

  /** Ma tournée, ou `null` : absente, ou affectée à un autre. */
  abstract roundOf(staffUserId: string, roundId: string): Promise<DriverRoundRow | null>;
}
