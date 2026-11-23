import type { CompanySalesIdentity } from "../../../account/domain/ports/company-sales-identity.reader.js";
import type { SalesExportOrder } from "../../../orders/domain/ports/sales-export.reader.js";
import type { SubjectSucceededRefund } from "../../../../payment/channels/requests/index.js";

/** Ce que les lectures par lot ont rendu, rangé par identifiant pour le mapping. */
export interface SalesExportLookups {
  readonly familyNames: ReadonlyMap<string, string>;
  readonly companies: ReadonlyMap<string, CompanySalesIdentity>;
  readonly refundsByOrder: ReadonlyMap<string, readonly SubjectSucceededRefund[]>;
}

/**
 * **La société qu'une commande peut nommer** : celle qui commande, et jamais
 * pour un particulier (décision de Hugo du 2026-11-23, § 10 Q3) — une
 * commande `public` ne nomme personne, même si elle porte une société.
 */
export function namedCompanyOf(order: SalesExportOrder): string | null {
  return order.clientele === "public" ? null : order.companyId;
}

/** Les remboursements rangés par commande, dans l'ordre où la lecture les rend. */
export function refundsByOrderOf(
  refunds: readonly SubjectSucceededRefund[],
): ReadonlyMap<string, readonly SubjectSucceededRefund[]> {
  const byOrder = new Map<string, SubjectSucceededRefund[]>();
  for (const refund of refunds) {
    const list = byOrder.get(refund.subjectId) ?? [];
    list.push(refund);
    byOrder.set(refund.subjectId, list);
  }
  return byOrder;
}

/** Les valeurs distinctes non nulles, pour une lecture par lot. */
export function distinct(values: readonly (string | null)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}
