import type { Prisma } from "../../../../platform/database/client/client.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import { Backorder, type BackorderState } from "../domain/entities/backorder.js";
import { BackorderLine } from "../domain/value-objects/backorder-line.js";

/** Les colonnes que l'agrégat relit. */
export const BACKORDER_SELECT = {
  id: true,
  originOrderId: true,
  companyId: true,
  buyerUserId: true,
  lines: true,
  state: true,
  convertedOrderId: true,
  closedAt: true,
  closedByStaffId: true,
  createdAt: true,
} as const satisfies Prisma.BackorderSelect;

export type BackorderRow = Prisma.BackorderGetPayload<{ select: typeof BACKORDER_SELECT }>;

const STATES: readonly BackorderState[] = ["open", "converted", "abandoned"];

/** Une ligne de `backorder` que l'agrégat ne sait pas relire : la base a été écrite hors de lui. */
export class BackorderRowUnreadableError extends TechnicalError {
  constructor(id: string, problem: string) {
    super(
      "orders.backorder.row_unreadable",
      `Le reliquat ${id} est illisible en base (${problem}) : il n'a été ni lu ni modifié. ` +
        "Signalez-le à l'équipe technique avec cet identifiant.",
    );
  }
}

/** La ligne → l'agrégat ; lignes revalidées par leur value object. */
export function backorderOf(row: BackorderRow): Backorder {
  const state = STATES.find((known) => known === row.state);
  if (state === undefined) {
    throw new BackorderRowUnreadableError(row.id, `état « ${row.state} » inconnu`);
  }
  return Backorder.restore({
    id: row.id,
    originOrderId: row.originOrderId,
    companyId: row.companyId,
    buyerUserId: row.buyerUserId,
    lines: linesOf(row.id, row.lines),
    state,
    convertedOrderId: row.convertedOrderId,
    closedAt: row.closedAt,
    closedByStaffId: row.closedByStaffId,
    createdAt: row.createdAt,
  });
}

function linesOf(id: string, raw: Prisma.JsonValue): BackorderLine[] {
  if (!Array.isArray(raw)) {
    throw new BackorderRowUnreadableError(id, "les lignes ne sont pas une liste");
  }
  return raw.map((item) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new BackorderRowUnreadableError(id, "une ligne n'est pas un objet");
    }
    const { sku, quantity, sale_unit: saleUnit } = item;
    if (typeof sku !== "string" || typeof quantity !== "number" || typeof saleUnit !== "string") {
      throw new BackorderRowUnreadableError(
        id,
        "une ligne n'a pas d'article, de quantité ou d'unité",
      );
    }
    return BackorderLine.of({ sku, quantity, saleUnit });
  });
}

/** Les lignes → le `jsonb`, dans les clés de la colonne. */
export function backorderLinesJson(
  lines: readonly BackorderLine[],
): { sku: string; quantity: number; sale_unit: string }[] {
  return lines.map((line) => ({
    sku: line.sku,
    quantity: line.quantity,
    sale_unit: line.saleUnit,
  }));
}
