import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { readLocalizedColumn } from "../../catalogue/shared/infrastructure/json-readers.js";
import { toIncoCategory } from "../domain/value-objects/inco-category.js";
import {
  AllergenCatalogueReader,
  type AllergenCategoryView,
  type AllergenEntryView,
} from "../domain/ports/allergen-catalogue.reader.js";
import type { AllergenCategoryRow, AllergenEntryRow } from "./allergen-rows.js";

/**
 * Le référentiel **en lecture**, catégories et entrées cousues d'un bloc.
 *
 * Une seule requête avec `include` plutôt que deux listes à recoudre : le
 * mapping est n:1 et c'est tout l'objet du modèle. La table fait quarante-cinq
 * lignes semées ; il n'y a rien à paginer, et un lecteur qui devrait rapprocher
 * lui-même referait ce rapprochement dans chaque écran.
 *
 * **Aucun filtre ici**, ni `eu`/`world` (D2), ni l'archivage (D2 bis) : ce sont
 * deux règles de LECTURE qui répondent à deux questions différentes, et les
 * poser dans l'adaptateur les dupliquerait dans chaque implémentation du port.
 * Le catalogue rend ce que le référentiel contient ; l'application choisit ce
 * qu'elle en montre.
 */
@Injectable()
export class PrismaAllergenCatalogueReader extends AllergenCatalogueReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async catalogue(): Promise<readonly AllergenCategoryView[]> {
    const rows = await this.prisma.allergenCategory.findMany({
      // `position` est l'ordre voulu par le staff ; `key` départage deux rangs
      // égaux, faute de quoi l'affichage retomberait sur l'ordre d'insertion et
      // changerait d'une requête à l'autre.
      orderBy: [{ position: "asc" }, { key: "asc" }],
      // Les entrées par CODE : le semis les a toutes écrites au même instant,
      // donc il n'y a pas d'ordre d'insertion à retrouver, et un ordre stable
      // vaut mieux qu'un ordre au hasard du planificateur.
      include: { entries: { orderBy: { code: "asc" } } },
    });
    return rows.map(toCategoryView);
  }

  /**
   * Tous les codes, **archivés compris** (D2 bis) : une déclaration enregistrée
   * hier cite un code que le staff archive demain, et la relire ne doit pas la
   * déclarer invalide. C'est `catalogue()` et son `archivedAt` qui servent le
   * sélecteur.
   */
  async knownCodes(): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.allergenEntry.findMany({ select: { code: true } });
    return new Set(rows.map((row) => row.code));
  }
}

function toEntryView(row: AllergenEntryRow): AllergenEntryView {
  return {
    id: row.id,
    code: row.code,
    name: readLocalizedColumn(row.name, "allergen_entry.name"),
    official: row.official,
    archivedAt: row.archivedAt,
  };
}

/**
 * `inco_category` repasse par sa garde même en lecture : une colonne texte
 * écrite hors du domaine — un `psql`, une migration correctrice — doit se
 * signaler ici plutôt que ressortir vers une projection d'étiquette.
 */
function toCategoryView(
  row: AllergenCategoryRow & { readonly entries: readonly AllergenEntryRow[] },
): AllergenCategoryView {
  return {
    id: row.id,
    key: row.key,
    name: readLocalizedColumn(row.name, "allergen_category.name"),
    incoCategory: toIncoCategory(row.incoCategory),
    official: row.official,
    position: row.position,
    archivedAt: row.archivedAt,
    entries: row.entries.map(toEntryView),
  };
}
