import type { PackingContainerView, PackingLine, PackingSheet } from "@lfd/contracts";

import type { SheetLine } from "../entities/packing-sheet.snapshot.js";
import type { BoardOrder } from "../ports/packing-board.reader.js";
import { allocatedOnLine, leftToPlace } from "./placement.js";

/** « Faut-il encore attendre le four pour poser `quantity` pièces de `sku` ? » */
export type Awaiting = (sku: string, quantity: number) => boolean;

/** Ce que le handler résout hors des tables du colisage, pour une fiche. */
export interface SheetContext {
  readonly awaiting: Awaiting;
  readonly destinationOf: (orderId: string) => string;
  readonly authorName: (reference: string | null) => string | null;
  readonly heldOrders: ReadonlySet<string>;
}

/**
 * **La règle de « Déclarer prête »** — celle de l'ancien poste (décidée le
 * 2026-09-14) : toutes les lignes au bac, une ligne au moins, pas déjà fermée ;
 * et, depuis K3c, une commande `listed` — une commande colisée avec l'ancien
 * poste est en lecture seule (§17.6), l'agrégat refuserait de la fermer.
 */
export function canDeclareReady(order: BoardOrder): boolean {
  return (
    order.containerMode === "listed" &&
    order.packed === null &&
    order.lines.length > 0 &&
    order.lines.every((line) => line.packed !== null)
  );
}

/**
 * Une fiche du poste, dans la forme de `PackingSheet` — compteurs, contenants
 * et colonne « À répartir » compris, tous calculés ici : l'écran n'additionne
 * rien.
 */
export function sheetOf(order: BoardOrder, context: SheetContext): PackingSheet {
  const packed = order.lines.filter((line) => line.packed !== null);
  const allocatedOf = allocationOf(order);
  return {
    orderId: order.orderId,
    reference: order.reference,
    containers: order.containers,
    customerLabel: order.customerLabel,
    fulfillmentMethod: order.fulfillmentMethod,
    destination: context.destinationOf(order.orderId),
    lines: linesOf(order, context.awaiting, allocatedOf),
    lineCount: order.lines.length,
    packedLines: packed.length,
    remainingLines: order.lines.length - packed.length,
    pieces: sumOfQuantities(order.lines),
    // Les pièces POSÉES, lignes ouvertes comprises — 18 croissants dans un sac
    // comptent avant que leur ligne soit cochée (bug du 2026-10-05).
    packedPieces: order.lines.reduce((sum, line) => sum + allocatedOf(line), 0),
    canDeclareReady: canDeclareReady(order),
    packedAt: order.packed?.at.toISOString() ?? null,
    packedBy: order.packed?.by ?? null,
    packedByName: context.authorName(order.packed?.by ?? null),
    qualityHeld: context.heldOrders.has(order.orderId),
    containerMode: order.containerMode,
    containerList: order.containerMode === "listed" ? containersOf(order) : [],
  };
}

/** Les pièces posées d'une ligne de cette commande — la règle de `placement.ts`. */
export function allocationOf(order: BoardOrder): (line: SheetLine) => number {
  return (line) => allocatedOnLine(order.containerMode, line, order.containerList);
}

/** Les lignes d'un bac, rangées par nom puis SKU. */
function linesOf(
  order: BoardOrder,
  awaiting: Awaiting,
  allocatedOf: (line: SheetLine) => number,
): readonly PackingLine[] {
  return [...order.lines]
    .map((line) => {
      const allocated = allocatedOf(line);
      const toPlace = leftToPlace(line.quantity, allocated);
      return {
        sku: line.sku,
        productName: line.productName,
        quantity: line.quantity,
        packed: line.packed !== null,
        // La chaîne vide n'est pas une signature : `null`, comme l'ancien poste.
        initials: line.packed === null || line.packed.initials === "" ? null : line.packed.initials,
        packedAt: line.packed?.at.toISOString() ?? null,
        // Une ligne déjà au bac n'attend plus rien ; une ligne ouverte n'attend
        // que ce qui lui reste à poser — pas les pièces déjà dans un sac.
        awaitingProduction: line.packed === null && awaiting(line.sku, toPlace),
        allocated,
        unallocated: toPlace,
      };
    })
    .sort(byNameThenSku);
}

function containersOf(order: BoardOrder): readonly PackingContainerView[] {
  const names = new Map(order.lines.map((line) => [line.sku, line.productName] as const));
  return order.containerList.map((container) => ({
    id: container.id,
    nature: container.nature,
    label: container.label,
    binId: container.bin?.binId ?? null,
    binCode: container.bin?.code ?? null,
    binHalf: container.bin?.half ?? null,
    lines: container.lines.map((line) => ({
      sku: line.sku,
      productName: names.get(line.sku) ?? line.sku,
      quantity: line.quantity,
    })),
    pieces: container.lines.reduce((sum, line) => sum + line.quantity, 0),
  }));
}

export function sumOfQuantities(lines: readonly { readonly quantity: number }[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

/** Le nom d'abord — c'est ce qu'on cherche des yeux ; le SKU départage. */
export function byNameThenSku(
  left: { readonly productName: string; readonly sku: string },
  right: { readonly productName: string; readonly sku: string },
): number {
  return left.productName.localeCompare(right.productName) || left.sku.localeCompare(right.sku);
}
