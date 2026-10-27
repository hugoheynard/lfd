import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { readStringArrayColumn } from "../../shared/infrastructure/json-readers.js";
import { PublishedAllergensReader } from "../domain/ports/published-allergens.reader.js";

/**
 * L'union lue en une requête : les déclarations PROPRES des déclinaisons en
 * vente (non arrêtées) des fiches publiées.
 *
 * Une déclinaison qui suit le défaut (`regulatory_follows_default`) sert la
 * déclaration de sa déclinaison par défaut, qui appartient à la même fiche et
 * entre donc déjà dans l'union : lire sa ligne propre, éventuellement périmée,
 * y ajouterait ce qu'elle ne sert pas. Elle est écartée.
 */
@Injectable()
export class PrismaPublishedAllergensReader extends PublishedAllergensReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async union(): Promise<readonly string[]> {
    const rows = await this.prisma.variantAllergens.findMany({
      where: {
        variant: {
          isDiscontinued: false,
          regulatoryFollowsDefault: false,
          product: { status: "published" },
        },
      },
      select: { allergens: true },
    });
    const codes = new Set<string>();
    for (const row of rows) {
      for (const code of readStringArrayColumn(row.allergens, "variant_allergens.allergens")) {
        codes.add(code);
      }
    }
    return [...codes].sort();
  }
}
