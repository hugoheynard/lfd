/** Un sac, tel que les vues le lisent. */
export interface BagRow {
  readonly id: string;
  readonly orderId: string;
  readonly code: string;
  readonly voidedAt: Date | null;
}

/** Un arrêt vivant vu du dépôt : les sacs de sa commande, et ceux chargés ICI. */
export interface LoadingStopRow {
  readonly stopId: string;
  readonly orderId: string;
  readonly position: number;
  /** Tous les sacs de la commande, annulés compris, dans l'ordre de déclaration. */
  readonly bags: readonly BagRow[];
  /** Les sacs chargés dans CET arrêt, et quand. */
  readonly loaded: ReadonlyMap<string, Date>;
}

/** Une tournée, vue du dépôt. */
export interface LoadingRoundRow {
  readonly id: string;
  readonly serviceDay: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly version: number;
  readonly departedAt: Date | null;
  /** Arrêts vivants, dans l'ordre de passage. */
  readonly stops: readonly LoadingStopRow[];
}

/** Où part un sac : la tournée vivante de sa commande, et s'il y est chargé. */
export interface BagDestinationRow {
  readonly roundId: string;
  readonly serviceDay: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly departedAt: Date | null;
  readonly loadedAt: Date | null;
}

/**
 * Port de **lecture** du chargement (lot 4) — distinct des ports d'écriture
 * (ISP) : les vues n'ont besoin d'aucun agrégat, et ne verrouillent rien.
 * Imprimer une étiquette, ouvrir le QR d'un sac : des lectures, qui n'écrivent
 * rien (L4-C13, L4-C16).
 */
export abstract class DeliveryLoadingReader {
  /** La tournée et ses arrêts vivants, ou `null` si elle n'existe pas. */
  abstract round(roundId: string): Promise<LoadingRoundRow | null>;

  /**
   * Les tournées d'un jour et leurs arrêts vivants — véhicule par véhicule
   * (ordre de la flotte), puis par passage, comme la composition.
   */
  abstract roundsOn(serviceDay: string): Promise<readonly LoadingRoundRow[]>;

  /** Les sacs d'une commande, annulés compris, dans l'ordre de déclaration. */
  abstract orderBags(orderId: string): Promise<readonly BagRow[]>;

  /** Un sac, ou `null`. */
  abstract bag(bagId: string): Promise<BagRow | null>;

  /** La tournée vivante de cette commande, tous jours confondus (I3), ou `null`. */
  abstract destinationOf(orderId: string, bagId: string): Promise<BagDestinationRow | null>;
}
