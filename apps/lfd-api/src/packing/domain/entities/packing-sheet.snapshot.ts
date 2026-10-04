import type { PackingContainerState } from "./order-contents.js";

/**
 * Le plafond d'une commande : **99 containers** — le même nombre que l'ancien
 * poste (`production/domain/value-objects/container-step.ts`) et que
 * `setPackingContainersSchema` côté contrat. Recopié et non importé : le
 * colisage n'atteint le fournil que par son canal, et ce nombre est désormais
 * une règle du colisage (§11 MINEURS). Les trois bougent ensemble.
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
  readonly packed: SheetLineMark | null;
}

/**
 * `counted` : l'ancien écran, un compte de contenants. `listed` : la colonne
 * Contenants (K2b), posé à l'inscription de la liste à coliser.
 */
export type ContainerMode = "counted" | "listed";

/** L'état d'un bac, tel que l'adaptateur l'écrit et le relit. */
export interface PackingSheetSnapshot {
  readonly serviceDay: string;
  readonly orderId: string;
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
}

/** Un pas de container — le type du canal, structurellement. */
export type ContainerStep = "add" | "remove";
