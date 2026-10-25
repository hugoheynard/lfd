import { Injectable } from "@nestjs/common";

import {
  ShortfallAftermathReader,
  type AbandonedLine,
  type ShortfallAftermath,
  type ShortfallDecisionMark,
} from "../../../packing/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ShortfallQuantity } from "../domain/entities/order-shortfall.js";
import { shortfallLinesOf } from "./prisma-order-shortfall.repository.js";

/** Ce qu'il faut d'un BL vivant pour savoir s'il est imprimé à sa version courante. */
export interface PrintedPaper {
  readonly contentVersion: number;
  readonly printedVersion: number | null;
}

/**
 * Le commerce répond au poste de colisage (Hugo, 2026-10-25) : pour chaque
 * commande au départ incomplet décidé, le reste abandonné — relu sur le
 * signal que la décision a figé, `shortfall_lines`, que la décision ne
 * touche pas — et l'impression de ses BL vivants.
 *
 * Trois lectures, toutes bornées aux commandes décidées parmi celles du
 * poste ; jamais les lignes de toute la journée.
 */
@Injectable()
export class PrismaShortfallAftermathReader extends ShortfallAftermathReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async among(orderIds: readonly string[]): Promise<ReadonlyMap<string, ShortfallAftermath>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const decided = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] }, shortfallDecidedAt: { not: null } },
      select: {
        id: true,
        shortfallLines: true,
        shortfallDecision: {
          select: { decidedAt: true, decidedByStaffId: true, remainder: true },
        },
      },
    });
    if (decided.length === 0) {
      return new Map();
    }
    const ids = decided.map((row) => row.id);
    const [lines, notes] = await Promise.all([
      this.prisma.orderLine.findMany({
        where: { orderId: { in: ids } },
        select: { orderId: true, sku: true, productNameSnapshot: true },
      }),
      this.prisma.deliveryNote.findMany({
        where: { orderId: { in: ids }, status: { not: "voided" } },
        select: { orderId: true, contentVersion: true, printedVersion: true },
      }),
    ]);
    return new Map(
      decided.map((row) => [
        row.id,
        {
          abandoned: abandonedOf(
            row.shortfallLines === null ? [] : shortfallLinesOf(row.shortfallLines),
            new Map(
              lines
                .filter((line) => line.orderId === row.id)
                .map((l) => [l.sku, l.productNameSnapshot]),
            ),
          ),
          deliveryNote: printStateOf(notes.filter((note) => note.orderId === row.id)),
          decision: decisionMarkOf(row.shortfallDecision),
        },
      ]),
    );
  }
}

/**
 * Le reste abandonné : par article, le dû moins ce qui est parti — ce qui
 * était au bac au signal, exactement ce que la décision a fait partir. Un
 * article absent des lignes garde son SKU plutôt qu'un nom inventé.
 */
export function abandonedOf(
  lines: readonly ShortfallQuantity[],
  names: ReadonlyMap<string, string>,
): readonly AbandonedLine[] {
  return lines
    .filter((line) => line.packed < line.due)
    .map((line) => ({
      sku: line.sku,
      productName: names.get(line.sku) ?? line.sku,
      quantity: line.due - line.packed,
    }));
}

/**
 * L'impression des BL vivants d'un départ décidé : `to_print` dès qu'un BL
 * n'est pas imprimé à sa version courante — jamais imprimé compris, à la
 * différence de `reprintNeededOf` —, `printed` s'ils le sont tous, `null`
 * sans BL vivant.
 */
export function printStateOf(notes: readonly PrintedPaper[]): ShortfallAftermath["deliveryNote"] {
  if (notes.length === 0) {
    return null;
  }
  return notes.every((note) => note.printedVersion === note.contentVersion)
    ? "printed"
    : "to_print";
}

/** Ce qu'il faut d'une décision pour la dire au poste. */
export interface DecisionRow {
  readonly decidedAt: Date;
  readonly decidedByStaffId: string;
  readonly remainder: string;
}

/**
 * La décision telle que le poste la dit. Le reste n'a qu'une valeur en base,
 * `abandoned` (CHECK) ; une autre — « à relivrer », E7 — ne se dit pas
 * « abandonné » : `null` plutôt qu'un mot faux.
 */
export function decisionMarkOf(row: DecisionRow | null): ShortfallDecisionMark | null {
  if (row === null || row.remainder !== "abandoned") {
    return null;
  }
  return { remainder: "abandoned", decidedAt: row.decidedAt, decidedBy: row.decidedByStaffId };
}
