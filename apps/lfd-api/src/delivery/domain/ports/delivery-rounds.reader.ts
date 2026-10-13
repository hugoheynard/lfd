import type { PlannedTiming } from "../value-objects/planned-timing.js";

import type { StopSubject } from "../entities/delivery-round-state.js";

/**
 * Un arrêt vivant, pour la vue — de commande, ou de transfert interne (plan
 * du transfert interne, §4). Un lecteur qui lit `orderId` sans tester `kind`
 * ne compile pas.
 */
export type RoundStopRow = StopSubject & {
  readonly stopId: string;
  readonly position: number;
};

/** Ce que la vue dit d'un transfert interne : son site, et combien de commandes il porte. */
export interface RoundTransferRow {
  readonly siteLabel: string;
  readonly orderCount: number;
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
  /** Le livreur affecté (plan « Ma tournée », MT-D2), ou `null`. */
  readonly driverStaffId: string | null;
  /** Rentrée le (« Tournée terminée », PL2), ou `null`. */
  readonly returnedAt: Date | null;
  /** L'horaire prévu (I10), ou `null` : jamais calculé, ou effacé par un geste à la main. */
  readonly planned: PlannedTiming | null;
  /** Arrêts vivants (ni retirés, ni clos), dans l'ordre de passage. */
  readonly stops: readonly RoundStopRow[];
  /** Les transferts internes de ses arrêts de transfert, par identifiant (lot T1). */
  readonly transfers: ReadonlyMap<string, RoundTransferRow>;
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
