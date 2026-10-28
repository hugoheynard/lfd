import type { SaleUnit } from "@lfd/money";

import type { PackingContainerState } from "./order-contents.js";

/**
 * Le plafond d'une commande : **99 contenants** — une règle du colisage
 * (§11 MINEURS), seule depuis que l'ancien poste et son compte « + / − » sont
 * retirés (K3c).
 */
export const MAX_CONTAINERS_PER_ORDER = 99;

/** Une signature : l'instant et la fiche staff. */
export interface SheetMark {
  readonly at: Date;
  readonly by: string;
}

/** La ligne au bac — avec les initiales, vides permises. */
export interface SheetLineMark extends SheetMark {
  readonly initials: string;
}

/** Une ligne à coliser : l'article, la quantité due, et si elle est au bac. */
export interface SheetLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  /**
   * L'unité de la ligne (P6 de `pricing/vente-au-poids.md`) : `weight` =
   * `quantity` compte des grammes, et la ligne se met au bac en UN lot.
   */
  readonly saleUnit: SaleUnit;
  readonly packed: SheetLineMark | null;
}

/**
 * `counted` : colisée avec l'ancien poste — en lecture seule depuis K3c
 * (§17.6). `listed` : la colonne Contenants (K2b), posé à l'inscription de la
 * liste à coliser.
 */
export type ContainerMode = "counted" | "listed";

/** L'état d'un bac, tel que l'adaptateur l'écrit et le relit. */
export interface PackingSheetSnapshot {
  readonly serviceDay: string;
  readonly orderId: string;
  /**
   * Le rang de l'envoi (plan E7 reliquat, choix 5, lot L3b) : la feuille est
   * `(jour, commande, rang)`. Absent = 1, la commande elle-même — une fixture
   * qui n'en parle pas.
   */
  readonly rank?: number;
  readonly reference: string;
  readonly packed: SheetMark | null;
  /** Sur `listed`, le nombre de contenants vivants — l'agrégat le tient. */
  readonly containers: number;
  readonly lines: readonly SheetLine[];
  readonly containerMode: ContainerMode;
  /** Livraison = bacs, retrait = sacs (Hugo, 2026-10-04). */
  readonly fulfillmentMethod: "pickup" | "delivery";
  /** Vide sur `counted`. */
  readonly containerList: readonly PackingContainerState[];
  /**
   * L'instant du manque signalé en vigueur (E6a). Absent = aucun : un bac
   * relu d'avant le champ, ou une fixture qui n'en parle pas.
   */
  readonly shortfallReportedAt?: Date | null;
  /**
   * Le départ incomplet décidé par le commerce (E6b) : les lignes dues sont
   * celles du bac. Absent = aucun.
   */
  readonly shortfallAuthorizedAt?: Date | null;
  /** La feuille retirée par une annulation après l'arrêt (plan A1). Absent = vivante. */
  readonly withdrawnAt?: Date | null;
}
