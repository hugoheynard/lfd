import { Injectable } from "@nestjs/common";

import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { ProductComposition } from "../domain/entities/product-composition.entity.js";
import { ProductCompositionCopier } from "../domain/ports/product-composition.copier.js";
import { ProductCompositionRepository } from "../domain/ports/product-composition.repository.js";

/**
 * La provenance recopie ce qu'une fiche cite sur une autre, pour le catalogue
 * (`ProductCompositionCopier`). Par son propre agrégat : la composition de
 * l'origine, chargée, devient celle de la fiche née d'elle
 * (`ProductComposition.copiedFrom`, archivés compris), et le même dépôt
 * l'écrit d'un bloc. Une fiche qui ne cite rien ne s'écrit pas.
 */
@Injectable()
export class IngredientCompositionCopier extends ProductCompositionCopier {
  constructor(private readonly compositions: ProductCompositionRepository) {
    super();
  }

  async copy(fromProductId: string, toProductId: string, ticket: WriteTicket): Promise<void> {
    const origin = await this.compositions.load(fromProductId);
    if (origin.keys.length === 0) {
      return;
    }
    await this.compositions.save(ProductComposition.copiedFrom(origin, toProductId), ticket);
  }
}
