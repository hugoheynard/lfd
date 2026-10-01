import type { DeliveryIncidentFamily } from "@lfd/contracts";

/** Un signalement, tel que les vues le lisent. */
export interface DeliveryIncidentRow {
  readonly id: string;
  readonly roundId: string;
  readonly stopId: string | null;
  /** Le numéro de commande de l'arrêt, figé au départ ; `null` sans arrêt. */
  readonly orderReference: string | null;
  readonly family: DeliveryIncidentFamily;
  readonly reason: string;
  readonly note: string;
  readonly hasPhoto: boolean;
  readonly reportedAt: Date;
  readonly reportedBy: string;
  /** `""` : l'annuaire ne lui connaissait pas de nom au geste. */
  readonly reportedByName: string;
}

/**
 * Port de **lecture** des signalements (`plan-a-la-porte.md`, § 3, AP-D7).
 * Tous rendus du plus ancien au plus récent.
 */
export abstract class DeliveryIncidentsReader {
  /** Ceux d'une journée, toutes tournées confondues. */
  abstract ofDay(day: string): Promise<readonly DeliveryIncidentRow[]>;

  /** Ceux de ces tournées. */
  abstract ofRounds(roundIds: readonly string[]): Promise<readonly DeliveryIncidentRow[]>;
}
