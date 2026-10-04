/** La ligne mise au bac : l'instant, la fiche staff, les initiales (vides permises). */
export interface StationLineMark {
  readonly at: Date;
  readonly by: string;
  readonly initials: string;
}

/** La fermeture d'un bac : l'instant et la fiche staff. */
export interface StationSeal {
  readonly at: Date;
  readonly by: string;
}

/** L'accusé d'une fermeture — celle d'origine quand le bac l'était déjà. */
export interface StationSealAck {
  readonly packedAt: Date;
  readonly packedBy: string;
  readonly alreadyPacked: boolean;
}

/** La commande visée : son identifiant opaque, et la référence que lit le poste. */
export interface StationOrderRef {
  /** `AAAA-MM-JJ`. */
  readonly serviceDay: string;
  readonly orderId: string;
  /** Celle des messages de refus — le poste ne connaît que la feuille. */
  readonly reference: string;
}

/**
 * **Le poste de colisage d'une journée `packing`** — port que le fournil
 * DÉCLARE et que le colisage IMPLÉMENTE (plan
 * `documentation/colisage/plan-domaine-colisage.md`, K2, §13 B1).
 *
 * Les routes du poste restent servies par le fournil, à leur adresse — celle
 * des QR imprimés —, contrats inchangés. Sur une journée `packing`, il fait ses
 * propres refus structurels (journée arrêtée, référence au plan), puis remet le
 * geste ici : les règles du bac (scellé, plafond, ligne réversible, « pas encore
 * sorti du four ») vivent désormais chez le colisage, sous le verrou de sa
 * réserve `(jour, SKU)`.
 *
 * Même figure que `production/channels/handover/` : le fournil n'importe rien
 * du colisage ; la racine de composition relie (`PackingFeedModule`).
 */
export abstract class PackingStation {
  /** La ligne entre au bac. Recocher réécrit la signature, sans reprendre de pièce. */
  abstract markLine(order: StationOrderRef, sku: string, mark: StationLineMark): Promise<void>;

  /** La ligne ressort du bac, tant qu'il est ouvert. */
  abstract unmarkLine(order: StationOrderRef, sku: string): Promise<void>;

  /**
   * Le bac est fermé, et `packing.order_packed` part dans la même transaction.
   * Un bac déjà fermé est REANNONCÉ (fait neuf, mêmes instant et auteur).
   */
  abstract seal(order: StationOrderRef, mark: StationSeal): Promise<StationSealAck>;

  /** Un container de plus ou de moins ; un retrait à zéro est sans effet. */
  abstract stepContainers(order: StationOrderRef, step: "add" | "remove"): Promise<void>;

  /** Le total de containers (route dépréciée, encore servie). */
  abstract declareContainers(order: StationOrderRef, containers: number): Promise<void>;
}

/** Une ligne de bac, telle que le colisage la tient. */
export interface StationLine {
  readonly sku: string;
  /** `null` = pas au bac. */
  readonly packed: StationLineMark | null;
}

/** Un bac, tel que le colisage le tient. */
export interface StationOrder {
  readonly orderId: string;
  /** `null` = ouvert. */
  readonly packed: StationSeal | null;
  readonly containers: number;
  readonly lines: readonly StationLine[];
}

/** La réserve d'un article : reçu du four, rendu, au bac. */
export interface StationStock {
  readonly sku: string;
  readonly received: number;
  readonly returned: number;
  readonly packed: number;
}

/** Ce que le colisage tient d'une journée. */
export interface StationDay {
  readonly orders: readonly StationOrder[];
  readonly stocks: readonly StationStock[];
}

/**
 * **Le poste de colisage, en lecture** — port séparé de l'écriture (ISP) : le
 * poste et la supervision lisent, ils n'écrivent pas. Déclaré par le fournil,
 * implémenté par le colisage.
 */
export abstract class PackingStationReader {
  abstract dayOf(serviceDay: string): Promise<StationDay>;
}
