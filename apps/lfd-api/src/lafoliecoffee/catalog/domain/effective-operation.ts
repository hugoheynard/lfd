import type { CatalogOperationFacts } from "./entities/catalog-operation.js";
import type { EffectiveOperationAudience } from "./operation-audience.js";

/** **Une opération telle que la boutique doit l'appliquer.** */
export interface EffectiveOperation {
  readonly key: string;
  readonly isHidden: boolean;
  readonly orderUntil: Date;
  /** `none` reste possible au type : une clientèle qui ne recouvre plus personne. */
  readonly audience: EffectiveOperationAudience;
  /** La sélection, dans l'ordre du rayon. */
  readonly skus: readonly string[];
}

/**
 * **L'opération telle que la boutique l'applique** : ses propres champs, et
 * son `hidden`, tenu par le commerce.
 *
 * Elle combinait, jusqu'à X2 (2026-10-17), la copie reçue du référentiel et
 * la surcharge posée à la réception. Les opérations s'écrivent au commerce
 * depuis le lot 3 du plan des opérations, la surcharge y a été versée par la
 * migration, et l'écran qui la posait est parti (décision de Hugo,
 * 2026-10-17) : la table `catalog_operation_overrides` reste en base, sans
 * lecteur.
 */
export function operationAsHeld(
  received: CatalogOperationFacts,
  hidden: boolean,
): EffectiveOperation {
  return {
    key: received.key,
    isHidden: hidden,
    orderUntil: received.orderUntil,
    audience: received.audience,
    skus: [...received.skus],
  };
}
