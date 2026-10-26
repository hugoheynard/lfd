import type {
  PackingContainerView,
  PackingDeliveryNotePrint,
  PackingLine,
  PackingSheet,
  PackingShortfallDecision,
} from "@lfd/contracts";

import type { SheetLine } from "../entities/packing-sheet.snapshot.js";
import type { BoardOrder } from "../ports/packing-board.reader.js";
import { allocatedOnLine, leftToPlace } from "./placement.js";
import type { ReadyBy } from "./ready-by.js";

/** « Faut-il encore attendre le four pour poser `quantity` pièces de `sku` ? » */
export type Awaiting = (sku: string, quantity: number) => boolean;

/** Ce que le handler résout hors des tables du colisage, pour une fiche. */
export interface SheetContext {
  readonly awaiting: Awaiting;
  readonly destinationOf: (orderId: string) => string;
  readonly authorName: (reference: string | null) => string | null;
  readonly heldOrders: ReadonlySet<string>;
  /** Les SKU froids, et les bacs isothermes vivants de la journée. */
  readonly cold: ColdPacking;
  /** L'heure « prête pour » de chaque commande (lot L2), déjà résolue. */
  readonly readyByOf: (order: BoardOrder) => ReadyBy;
  /**
   * Les commandes dont le BL a changé depuis son impression (plan E6, § 14),
   * lues au commerce. Absent = aucune.
   */
  readonly reprintNeeded?: ReadonlySet<string>;
  /** Les départs incomplets décidés, un par envoi, lus au commerce. Absent = aucun. */
  readonly aftermath?: readonly DecidedShipmentShortfall[];
}

/**
 * Un départ incomplet décidé, tel que le commerce le rend (Hugo,
 * 2026-10-25) — la forme du canal, relue ici sans connaître le port.
 */
export interface DecidedShortfall {
  readonly abandoned: readonly {
    readonly sku: string;
    readonly productName: string;
    readonly quantity: number;
  }[];
  readonly deliveryNote: "to_print" | "printed" | null;
  readonly decision: {
    readonly remainder: "abandoned";
    readonly decidedAt: Date;
    readonly decidedBy: string;
  } | null;
}

/** Le départ décidé d'un envoi `(commande, rang)` (plan E7 reliquat, LB). */
export interface DecidedShipmentShortfall extends DecidedShortfall {
  readonly orderId: string;
  readonly rank: number;
}

/** Le départ décidé de l'envoi de cette fiche — jamais celui d'un autre rang. */
function decidedOf(order: BoardOrder, context: SheetContext): DecidedShortfall | undefined {
  return context.aftermath?.find(
    (decided) => decided.orderId === order.orderId && decided.rank === order.rank,
  );
}

/** La décision dite au poste, l'auteur nommé par l'annuaire ; `null` sans décision. */
export function shortfallDecisionOf(
  decided: DecidedShortfall | undefined,
  authorName: (reference: string | null) => string | null,
): PackingShortfallDecision | null {
  const decision = decided?.decision ?? null;
  if (decision === null) {
    return null;
  }
  return {
    remainder: decision.remainder,
    decidedAt: decision.decidedAt.toISOString(),
    decidedBy: decision.decidedBy,
    decidedByName: authorName(decision.decidedBy),
  };
}

/**
 * **Le BL à réimprimer, ou réimprimé** : à réimprimer s'il a changé depuis
 * son impression (§ 14), ou si le départ est décidé et que son BL n'est pas
 * imprimé à sa version courante ; réimprimé quand le départ est décidé et
 * que tout est imprimé. Rien à dire hors de ces deux cas.
 */
export function deliveryNotePrintOf(
  reprintNeeded: boolean,
  decided: DecidedShortfall | undefined,
): PackingDeliveryNotePrint | null {
  if (reprintNeeded || decided?.deliveryNote === "to_print") {
    return "to_reprint";
  }
  return decided?.deliveryNote === "printed" ? "reprinted" : null;
}

/** Ce que la livraison dit du froid — relu ici sans connaître le port. */
export interface ColdPacking {
  readonly coldSkus: ReadonlySet<string>;
  readonly isothermBinIds: ReadonlySet<string>;
}

/**
 * **Le froid hors bac isotherme** (2026-10-07, audit livraisons Q3) : sur une
 * livraison rangée en contenants, les produits froids posés dans un sac ou
 * dans un bac qui n'est pas isotherme, par nom, sans doublon. Un
 * AVERTISSEMENT : « Déclarer prête » reste permis — rétabli après K3c, qui
 * l'avait retiré avec l'ancien poste.
 */
export function coldOutsideIsotherm(order: BoardOrder, cold: ColdPacking): readonly string[] {
  if (order.fulfillmentMethod !== "delivery" || order.containerMode !== "listed") {
    return [];
  }
  const outside = new Set(
    order.containerList
      .filter((container) => !isIsotherm(container.bin?.binId ?? null, cold))
      .flatMap((container) => container.lines.map((line) => line.sku))
      .filter((sku) => cold.coldSkus.has(sku)),
  );
  return [
    ...new Set(order.lines.filter((line) => outside.has(line.sku)).map((l) => l.productName)),
  ];
}

function isIsotherm(binId: string | null, cold: ColdPacking): boolean {
  return binId !== null && cold.isothermBinIds.has(binId);
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
 * **La règle de « Il manque »** (lot E6a) — celle de `PackingSheet.reportShortfall` :
 * un bac ouvert, `listed`, dont une ligne due n'est pas entièrement répartie.
 */
export function canReportShortfall(order: BoardOrder): boolean {
  const allocatedOf = allocationOf(order);
  return (
    order.containerMode === "listed" &&
    order.packed === null &&
    // Un départ décidé ne se re-signale pas (E6b).
    (order.shortfallAuthorizedAt ?? null) === null &&
    order.lines.some((line) => allocatedOf(line) < line.quantity)
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
  const readyBy = context.readyByOf(order);
  return {
    orderId: order.orderId,
    reference: order.reference,
    containers: order.containers,
    customerLabel: order.customerLabel,
    fulfillmentMethod: order.fulfillmentMethod,
    clientele: order.clientele,
    siteId: order.siteId,
    dueAt: order.dueAt,
    readyBy: readyBy.time,
    readyBySource: readyBy.source,
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
    canReportShortfall: canReportShortfall(order),
    shortfallReportedAt: order.shortfallReportedAt?.toISOString() ?? null,
    deliveryNoteReprintNeeded: context.reprintNeeded?.has(order.orderId) ?? false,
    deliveryNotePrint: deliveryNotePrintOf(
      context.reprintNeeded?.has(order.orderId) ?? false,
      decidedOf(order, context),
    ),
    abandonedRemainder: decidedOf(order, context)?.abandoned.map((line) => ({ ...line })) ?? [],
    shortfallDecision: shortfallDecisionOf(decidedOf(order, context), context.authorName),
    coldOutsideIsotherm: coldOutsideIsotherm(order, context.cold),
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
