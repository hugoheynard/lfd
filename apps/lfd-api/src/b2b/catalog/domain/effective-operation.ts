import type { CatalogOperationFacts } from "./entities/catalog-operation.js";
import type { OperationRestriction } from "./entities/catalog-operation-override.js";
import { intersectAudiences, type EffectiveOperationAudience } from "./operation-audience.js";

/**
 * **Une opération telle que la boutique doit l'appliquer** — le référentiel,
 * restreint par la réception (D9).
 */
export interface EffectiveOperation {
  readonly key: string;
  readonly isHidden: boolean;
  /** `min(référentiel, surcharge)` : c'est le plus tôt qui ferme. */
  readonly orderUntil: Date;
  /** L'intersection ; `none` quand elles ne se recouvrent pas. */
  readonly audience: EffectiveOperationAudience;
  /** La sélection reçue, moins les articles retirés à la réception, dans l'ordre du rayon. */
  readonly skus: readonly string[];
}

/**
 * **Combine** le reçu et la restriction — à la lecture, jamais à l'écriture.
 *
 * Pure, sans horloge : ce qu'elle rend ne dépend que de ses deux entrées, et
 * c'est ce qui permet à une surcharge posée avant un envoi de rester juste
 * après lui. `null` côté restriction = rien de décidé ici, on applique le
 * référentiel tel quel.
 *
 * Les autres dates ne se restreignent pas (D9 n'en propose pas) : elles
 * passent telles quelles, lues sur les faits.
 */
export function effectiveOperation(
  received: CatalogOperationFacts,
  restriction: OperationRestriction | null,
): EffectiveOperation {
  if (restriction === null) {
    return {
      key: received.key,
      isHidden: false,
      orderUntil: received.orderUntil,
      audience: received.audience,
      skus: [...received.skus],
    };
  }
  const hidden = new Set(restriction.hiddenSkus);
  return {
    key: received.key,
    isHidden: restriction.isHidden,
    orderUntil: earliest(received.orderUntil, restriction.orderUntil),
    audience: intersectAudiences(received.audience, restriction.audience),
    skus: received.skus.filter((sku) => !hidden.has(sku)),
  };
}

function earliest(received: Date, restricted: Date | null): Date {
  if (restricted === null) {
    return received;
  }
  return restricted.getTime() < received.getTime() ? restricted : received;
}
