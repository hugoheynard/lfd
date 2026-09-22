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
   * L'absence de ligne `variant_allergens` rend `null` — « personne n'a
   * déclaré » — là où une ligne au tableau vide rend `[]` : les deux états sont
   * ce qui décide si une reprise est offerte (D5), et les aplatir ici les
   * perdrait pour de bon.
   *
   * ⚠️ **Second lecteur de la fiche réglementaire**, avec `toVariant` du dépôt
   * produit. Le plan `plan-separer-allergenes-et-nutrition.md` (§6c bis) n'en
   * comptait qu'un : celui-ci lisait déjà `nutrition_declaration` au lot 3, et
   * l'oublier aurait laissé l'écran de composition afficher « aucune fiche » sur
   * une déclinaison déclarée la seconde d'avant (constaté le 2026-09-22).
   */
  async ofProduct(productId: string): Promise<readonly VariantDeclaredAllergens[]> {
    const rows = await this.prisma.productVariant.findMany({
      where: { productId },
      orderBy: { position: "asc" },
      select: { id: true, allergenSheet: { select: { allergens: true } } },
    });
    return rows.map((row) => ({
      variantId: row.id,
      allergens:
        row.allergenSheet === null
          ? null
          : readStringArrayColumn(row.allergenSheet.allergens, "variant_allergens.allergens"),
    }));
  }
}
