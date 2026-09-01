import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { readStringArrayColumn } from "../../catalogue/shared/infrastructure/json-readers.js";
import {
  VariantDeclarationReader,
  type VariantDeclaredAllergens,
} from "../domain/ports/variant-declaration.reader.js";

@Injectable()
export class PrismaVariantDeclarationReader extends VariantDeclarationReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  /**
   * Une seule requête, et seulement les codes : la comparaison n'a besoin ni
   * des valeurs nutritionnelles, ni des traces, ni du reste de la déclinaison.
   *
   * L'absence de ligne `nutrition` rend `null` — « aucune fiche » — là où une
   * ligne au tableau vide rend `[]` : les deux états sont ce qui décide si une
   * reprise est offerte (D5), et les aplatir ici les perdrait pour de bon.
   */
  async ofProduct(productId: string): Promise<readonly VariantDeclaredAllergens[]> {
    const rows = await this.prisma.productVariant.findMany({
      where: { productId },
      orderBy: { position: "asc" },
      select: { id: true, nutrition: { select: { allergens: true } } },
    });
    return rows.map((row) => ({
      variantId: row.id,
      allergens:
        row.nutrition === null
          ? null
          : readStringArrayColumn(row.nutrition.allergens, "nutrition.allergens"),
    }));
  }
}
