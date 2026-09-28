import type {
  QualityBoardView,
  QualityCheckView,
  QualityLineStatus,
  QualityOrderStatus,
} from "@lfd/contracts";

import type { ProductionDay } from "../../domain/entities/production-day.js";
import type { QualityCheck } from "../../domain/entities/quality-check.js";
import { plannedLinesOf } from "../../domain/services/quality-check-scope.js";
import { currentChecks, heldOrderIds, isStale } from "../../domain/services/quality-verdicts.js";

/**
 * **Les deux vues du contrôle qualité**, dérivées des verdicts rendus (D2, D3,
 * D5, D7). Des fonctions pures : le verdict courant, la péremption et la
 * retenue viennent de `quality-verdicts.ts`, jamais d'un état stocké.
 */

/** Les pastilles — lisibles en `read` : ni note, ni photo (D3). */
export function qualityBoardOf(
  day: ProductionDay,
  checks: readonly QualityCheck[],
): QualityBoardView {
  const current = [...currentChecks(checks).values()];
  const quantities = new Map(day.counts.map((count) => [count.sku, count.quantity]));
  const references = new Map(day.orders.map((order) => [order.orderId, order.reference]));
  const lines: QualityLineStatus[] = [];
  const orders: QualityOrderStatus[] = [];
  for (const check of current) {
    if (check.target.kind === "line") {
      lines.push(lineStatusOf(check, check.target, quantities.get(check.target.sku) ?? null));
    } else {
      const reference = references.get(check.target.orderId) ?? null;
      orders.push({
        orderId: check.target.orderId,
        reference,
        verdict: check.verdict,
        checkedAt: check.checkedAt.toISOString(),
      });
    }
  }
  return {
    date: day.day.value,
    lines: lines.sort((left, right) => left.sku.localeCompare(right.sku)),
    orders: orders.sort((left, right) => left.orderId.localeCompare(right.orderId)),
    heldOrderIds: [...heldOrderIds(day.day, checks, plannedLinesOf(day))].sort(),
  };
}

/** Une ligne a quitté le compte (`null`) : son contrôle ne vaut plus pour lui. */
function lineStatusOf(
  check: QualityCheck,
  target: { readonly sku: string; readonly quantitySeen: number },
  currentQuantity: number | null,
): QualityLineStatus {
  return {
    sku: target.sku,
    verdict: check.verdict,
    checkedAt: check.checkedAt.toISOString(),
    quantitySeen: target.quantitySeen,
    currentQuantity,
    stale: currentQuantity === null || isStale(check, currentQuantity),
  };
}

/** Un verdict en entier — servi en `write` seulement (D3). */
export function qualityCheckViewOf(
  check: QualityCheck,
  checkedByName: string | null,
): QualityCheckView {
  const target = check.target;
  return {
    id: check.id,
    target:
      target.kind === "line"
        ? { kind: "line", sku: target.sku, quantitySeen: target.quantitySeen }
        : { kind: "order", orderId: target.orderId },
    verdict: check.verdict,
    note: check.note,
    checkedBy: check.checkedBy,
    checkedByName,
    checkedAt: check.checkedAt.toISOString(),
    photos: check.photos.map((photo) => ({
      position: photo.position,
      contentType: photo.contentType,
      byteSize: photo.byteSize,
    })),
  };
}

/** Du plus récent au plus ancien ; l'`id` (ULID) départage. */
export function newestFirst(left: QualityCheck, right: QualityCheck): number {
  const delta = right.checkedAt.getTime() - left.checkedAt.getTime();
  return delta !== 0 ? delta : right.id.localeCompare(left.id);
}
