import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/** Le niveau que la route exigeait, et que la boutique n'atteint pas. */
export type ShopClosedRequirement = "browse" | "order";

const MESSAGES: Readonly<Record<ShopClosedRequirement, string>> = {
  browse: "La boutique n'est pas encore ouverte.",
  order: "Les commandes en ligne ne sont pas encore ouvertes.",
};

/**
 * **La boutique n'est pas ouverte à ce geste** (409).
 *
 * ⚠️ Ce n'est **pas** une autorisation : le refus ne dit rien de la personne,
 * tout de l'état de la boutique. D'où un refus métier (`409`) et non un `403`,
 * qui ferait chercher un droit manquant là où il n'y en a pas — la même raison
 * que `PublicationClosedError` (`pim/publication/publication-switch.ts`).
 *
 * Le message ne dit jamais qu'une exemption existe : il est le même pour tous
 * ceux qu'elle ne couvre pas.
 */
export class ShopClosedError extends BusinessError {
  constructor(readonly required: ShopClosedRequirement) {
    super(`feature_access.shop_closed_for_${required}`, MESSAGES[required]);
  }
}
