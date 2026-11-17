import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/** On ne bascule pas à vide : aucun produit n'a de poste (§ 3.9). */
export class NoProductPlacedError extends BusinessError {
  constructor() {
    super(
      "production.display_settings.no_product_placed",
      "Aucun produit n'a de poste : rangez-les depuis la page Postes, ou partez de “Simuler le catalogue en production”.",
    );
  }
}
