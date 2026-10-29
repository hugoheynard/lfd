import { Injectable } from "@nestjs/common";

import type { WriteTicket } from "../../../platform/journal/scoped-journal.js";
import { ProductCompositionCopier } from "../../catalogue/product/domain/ports/product-composition.copier.js";
import { IngredientRepository } from "../domain/ports/ingredient.repository.js";

/**
 * La provenance recopie ce qu'une fiche cite sur une autre, pour le catalogue
 * (`ProductCompositionCopier`). Par son propre dépôt : la même lecture que
 * l'écran (`ofProduct`, dans l'ordre), le même remplacement d'un bloc que
 * l'enregistrement (`setOfProduct`). Une fiche qui ne cite rien ne s'écrit pas.
 */
@Injectable()
export class IngredientCompositionCopier extends ProductCompositionCopier {
  constructor(private readonly ingredients: IngredientRepository) {
    super();
  }

  async copy(fromProductId: string, toProductId: string, ticket: WriteTicket): Promise<void> {
    const cited = await this.ingredients.ofProduct(fromProductId);
    if (cited.length === 0) {
      return;
    }
    await this.ingredients.setOfProduct(
      toProductId,
      cited.map((row) => row.key),
      ticket,
    );
  }
}
