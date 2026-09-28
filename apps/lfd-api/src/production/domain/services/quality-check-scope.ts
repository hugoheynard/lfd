import type { ProductionDay } from "../entities/production-day.js";
import type { QualityVerdict, QualityCheck } from "../entities/quality-check.js";
import {
  QualityLineNotCountedError,
  QualityOrderNotInPlanError,
  QualityOrderNotPackedError,
} from "../errors/quality-record-errors.js";
import type { QualityCheckTargetInput } from "../value-objects/quality-check-target.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";
import type { PlannedOrderLine } from "./quality-verdicts.js";

/**
 * **Ce qu'un contrôle vise dans SA journée** — la cible telle que l'écran la
 * nomme, confrontée à ce que le fournil a réellement (lot QC2).
 *
 * `QualityCheck.render` ne sait rien de la journée : il refuse une cible mal
 * formée, pas une cible absente. Ici, on la cherche :
 *
 * - une **ligne** doit être au compte d'une journée arrêtée, et sa quantité
 *   vue (D5) est lue au serveur — jamais annoncée par l'écran, qui pourrait
 *   montrer un compte d'avant un retirage ;
 * - une **commande** doit être au plan, et **colisée** : « une commande pas
 *   encore colisée ne se contrôle pas : il n'y a rien de fini à juger » (§5).
 */
export type QualityTargetRequest =
  | { readonly kind: "line"; readonly sku: string }
  | { readonly kind: "order"; readonly orderId: string };

/** La cible résolue, et le nom sous lequel le journal la dira. */
export interface ScopedQualityTarget {
  readonly target: QualityCheckTargetInput;
  /** Le SKU d'une ligne, la référence `ORD-…` d'une commande. */
  readonly label: string;
}

/**
 * @throws {QualityLineNotCountedError} le SKU n'est pas au compte de la journée.
 * @throws {QualityOrderNotInPlanError} la commande n'est pas au plan.
 * @throws {QualityOrderNotPackedError} la commande n'est pas colisée.
 */
export function scopeQualityTarget(
  day: ProductionDay,
  request: QualityTargetRequest,
): ScopedQualityTarget {
  if (request.kind === "line") {
    const item = day.counts.find((count) => count.sku === request.sku);
    if (item === undefined) {
      throw new QualityLineNotCountedError(day.day.value, request.sku);
    }
    return {
      target: { kind: "line", sku: item.sku, quantitySeen: item.quantity },
      label: item.sku,
    };
  }
  const order = day.orders.find((candidate) => candidate.orderId === request.orderId);
  if (order === undefined) {
    throw new QualityOrderNotInPlanError(day.day.value, request.orderId);
  }
  if (order.packed === null) {
    throw new QualityOrderNotPackedError(order.reference);
  }
  return { target: { kind: "order", orderId: order.orderId }, label: order.reference };
}

/** Les lignes du PLAN de la journée, sous la forme que la retenue lit (D6). */
export function plannedLinesOf(day: ProductionDay): readonly PlannedOrderLine[] {
  return day.orders.flatMap((order) =>
    order.lines.map((line) => ({ orderId: order.orderId, sku: line.sku })),
  );
}

/** Ce que l'écran demande — la clé d'idempotence et le contenu qu'elle couvre (D8). */
export interface QualityCheckIntent {
  readonly id: string;
  readonly serviceDay: ServiceDay;
  readonly target: QualityTargetRequest;
  readonly verdict: QualityVerdict;
  readonly note: string | null;
  readonly checkedBy: string;
  readonly uploadIds: readonly string[];
}

/**
 * Un rejeu dit-il **la même chose** que le contrôle déjà écrit ?
 *
 * La note est comparée comme l'entité la range (bornée, blanche = absente) ;
 * les photos par leurs dépôts, dans l'ordre. `quantitySeen` n'entre PAS dans la
 * comparaison : c'est le serveur qui la lit, et un retirage entre le geste et
 * son rejeu ne fait pas de ce rejeu un autre contrôle.
 */
export function isSameQualityIntent(existing: QualityCheck, intent: QualityCheckIntent): boolean {
  const target = existing.target;
  const sameTarget =
    target.kind === "line"
      ? intent.target.kind === "line" && intent.target.sku === target.sku
      : intent.target.kind === "order" && intent.target.orderId === target.orderId;
  const note = intent.note?.trim() ?? "";
  const uploads = existing.photos.map((photo) => photo.uploadId);
  return (
    sameTarget &&
    existing.serviceDay.equals(intent.serviceDay) &&
    existing.verdict === intent.verdict &&
    (existing.note ?? "") === note &&
    existing.checkedBy === intent.checkedBy &&
    uploads.length === intent.uploadIds.length &&
    uploads.every((uploadId, index) => uploadId === intent.uploadIds[index])
  );
}
