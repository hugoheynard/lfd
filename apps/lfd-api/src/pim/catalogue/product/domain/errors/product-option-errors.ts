import { DomainError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * Une activation « pour une liste » sans aucune déclinaison ne propose le
 * groupe nulle part : on choisit des déclinaisons, ou toutes, ou on retire le
 * groupe.
 */
export class EmptyOptionVariantListError extends DomainError {
  constructor(groupName: string) {
    super(
      "catalogue.product.option_variants_empty",
      `Choisissez au moins une déclinaison pour le groupe « ${groupName} », ` +
        `ou activez-le pour toutes — pour ne plus le proposer, retirez-le de la fiche.`,
    );
  }
}
