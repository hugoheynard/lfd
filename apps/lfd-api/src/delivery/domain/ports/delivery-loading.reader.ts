import type { StopPlace } from "../entities/shared-bin.js";
import type { BinHalf } from "../value-objects/bin-declaration.js";

/** Un bac déclaré, tel que les vues le lisent. */
export interface BinRow {
  readonly id: string;
  readonly orderId: string;
  readonly code: string;
  readonly voidedAt: Date | null;
  /** Son type — archivé depuis, il reste lisible (v2-7). */
  readonly binType: {
    readonly id: string;
    readonly name: string;
    readonly isotherm: boolean;
    readonly archived: boolean;
  };
  readonly half: BinHalf | null;
  readonly physicalBinId: string | null;
  readonly innerBags: number;
  /** L'autre moitié NON annulée du même bac physique, si elle est à une autre commande. */
  readonly partner: { readonly binId: string; readonly orderId: string } | null;
}

/** Un arrêt vivant vu du dépôt : les bacs de sa commande, et ceux chargés ICI. */
export interface LoadingStopRow {
  readonly stopId: string;
  readonly orderId: string;
  readonly position: number;
  /** Tous les bacs de la commande, annulés compris, dans l'ordre de déclaration. */
  readonly bins: readonly BinRow[];
  /** Les bacs chargés dans CET arrêt, et quand. */
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

/** Où part un bac : la tournée vivante de sa commande, et s'il y est chargé. */
export interface BinDestinationRow {
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
 * Imprimer une étiquette, ouvrir le QR d'un bac : des lectures, qui n'écrivent
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

  /** Les bacs d'une commande, annulés compris, dans l'ordre de déclaration. */
  abstract orderBins(orderId: string): Promise<readonly BinRow[]>;

  /** Un bac, ou `null`. */
  abstract bin(binId: string): Promise<BinRow | null>;

  /**
   * Où est l'arrêt vivant de chacune de ces commandes : sa tournée, et son rang
   * parmi les arrêts vivants de celle-ci. Une commande absente de la carte
   * n'est dans aucune tournée. De quoi calculer « à refaire » (v2-4).
   */
  abstract placesOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, StopPlace>>;

  /** La tournée vivante de cette commande, tous jours confondus (I3), ou `null`. */
  abstract destinationOf(orderId: string, binId: string): Promise<BinDestinationRow | null>;
}
