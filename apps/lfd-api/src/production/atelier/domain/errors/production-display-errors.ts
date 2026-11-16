import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Le mode prod est refusé tant que les écrans du prévisionnel ne rangent pas
 * par poste : la fiche le serait, le prévisionnel encore par rayon (plan
 * `fournil/plan-postes-du-fournil.md`, § 3.9).
 */
export class WorkstationGroupingNotYetOpenError extends BusinessError {
  constructor() {
    super(
      "production.display_settings.workstation_grouping_not_open",
      "Le rangement par poste (mode prod) n'est pas encore ouvert : il arrive avec le rangement par poste des écrans du prévisionnel. Restez en mode boutique d'ici là.",
    );
  }
}

/** On ne bascule pas à vide : aucun produit n'a de poste (§ 3.9). */
export class NoProductPlacedError extends BusinessError {
  constructor() {
    super(
      "production.display_settings.no_product_placed",
      "Aucun produit n'a de poste : rangez-les depuis la page Postes, ou partez de “Simuler le catalogue en production”.",
    );
  }
}
