import type { HandoverSubjectShipment } from "../../../handover/channels/commerce/index.js";
import { orderLineSaleUnitOf } from "./order-line-row.js";

/**
 * **Les restes d'une commande, pour le comptoir** (plan E7 reliquat, choix 13,
 * lot L4c) : ses bons de livraison de rang > 1 encore vivants, lignes nommées,
 * sans un montant.
 *
 * Un BL annulé n'a plus rien à tendre ; un BL remis reste rendu — c'est le
 * retrait, qui tient ses attestations, qui l'écarte de la liste à cocher.
 * Interne à `infrastructure/`, comme `HANDOVER_SELECT` qu'il complète.
 */
export const LATER_SHIPMENTS_SELECT = {
  where: { rank: { gt: 1 }, status: { not: "voided" } },
  orderBy: { rank: "asc" },
  select: {
    rank: true,
    status: true,
    lines: {
      orderBy: { id: "asc" },
      select: { sku: true, productName: true, quantity: true, saleUnit: true },
    },
  },
} as const;

/** Une ligne lue par {@link LATER_SHIPMENTS_SELECT}. */
interface LaterShipmentRow {
  readonly rank: number;
  readonly status: string;
  readonly lines: readonly {
    readonly sku: string;
    readonly productName: string;
    readonly quantity: number;
    readonly saleUnit: string;
  }[];
}

/** Colisé : le bac du reste est fermé (`prepared`), ou le reste est déjà parti. */
const PACKED_STATUSES: ReadonlySet<string> = new Set(["prepared", "handed_over"]);

/** Les lignes → les restes que le retrait attend. */
export function laterShipmentsOf(
  rows: readonly LaterShipmentRow[],
): readonly HandoverSubjectShipment[] {
  return rows.map((row) => ({
    rank: row.rank,
    prepared: PACKED_STATUSES.has(row.status),
    lines: row.lines.map((line) => ({
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      // Recopiée de la ligne de commande par le BL (P5) : le comptoir dit « 1,25 kg ».
      saleUnit: orderLineSaleUnitOf(line.sku, line.saleUnit),
    })),
  }));
}
