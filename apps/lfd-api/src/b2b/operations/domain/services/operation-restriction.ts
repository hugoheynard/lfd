import { intersectAudiences } from "../../../catalog/domain/operation-audience.js";
import type { ReferentialOperation } from "../entities/operation.js";
import { operationAudience, type OperationAudience } from "../value-objects/operation-audience.js";

/** Ce que la réception avait décidé d'une opération — la surcharge. */
export interface MigrationRestriction {
  readonly isHidden: boolean;
  readonly orderUntil: Date | null;
  readonly audience: OperationAudience | null;
  readonly hiddenSkus: readonly string[];
  readonly decidedBy: string | null;
  readonly decidedAt: Date;
}

/** La surcharge restreint-elle quelque chose ? Une ligne vide n'en est pas une. */
export function restricts(restriction: MigrationRestriction | null): boolean {
  return (
    restriction !== null &&
    (restriction.isHidden ||
      restriction.orderUntil !== null ||
      restriction.audience !== null ||
      restriction.hiddenSkus.length > 0)
  );
}

/**
 * Les valeurs restreintes — le calcul que portait `effectiveOperation`
 * côté catalogue (retiré en X2, 2026-10-17), versé dans l'opération.
 */
export function restrictedValues(
  values: ReferentialOperation,
  restriction: MigrationRestriction | null,
): ReferentialOperation {
  if (restriction === null) {
    return values;
  }
  const audience = intersectAudiences(operationAudience(values.audience), restriction.audience);
  const hiddenSkus = new Set(restriction.hiddenSkus);
  const closes = restriction.orderUntil;
  const orderUntil =
    closes !== null && closes.getTime() < values.schedule.orderUntil.getTime()
      ? closes
      : values.schedule.orderUntil;
  return {
    ...values,
    schedule: { ...values.schedule, orderUntil },
    audience: audience === "none" ? values.audience : audience,
    skus: values.skus.filter((sku) => !hiddenSkus.has(sku)),
    hidden: values.hidden || restriction.isHidden || audience === "none",
  };
}
