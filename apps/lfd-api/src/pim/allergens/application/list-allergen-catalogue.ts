import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { AllergenCategoryAdminView, AllergenEntryAdminView } from "@lfd/pim-contracts";

import {
  AllergenCatalogueReader,
  type AllergenCategoryView,
  type AllergenEntryView,
} from "../domain/ports/allergen-catalogue.reader.js";

/** Le référentiel **entier**, pour l'écran qui l'administre. Sans paramètre. */
export class ListAllergenCatalogueQuery {}

/**
 * Ce que l'écran d'administration lit — l'inverse exact du catalogue de saisie.
 *
 * Il ne filtre **rien** : ni le périmètre, ni l'archivage. C'est délibéré et
 * c'est la moitié de D2 bis — l'archivage retire de ce qu'on PROPOSE, et cet
 * écran-ci est justement celui d'où l'on restaure. Une catégorie retirée qu'on
 * ne voit pas est une catégorie qu'on ne peut plus remettre.
 *
 * Les libellés partent dans **toutes** leurs langues, là où le catalogue de
 * saisie les aplatit : ici on les édite.
 */
@QueryHandler(ListAllergenCatalogueQuery)
export class ListAllergenCatalogueHandler implements IQueryHandler<
  ListAllergenCatalogueQuery,
  AllergenCategoryAdminView[]
> {
  constructor(private readonly catalogue: AllergenCatalogueReader) {}

  async execute(): Promise<AllergenCategoryAdminView[]> {
    const categories = await this.catalogue.catalogue();
    return categories.map(toAdminView);
  }
}

/** Les instants partent en ISO : le fil ne transporte pas de `Date`. */
function isoOrNull(at: Date | null): string | null {
  return at === null ? null : at.toISOString();
}

function toEntryAdminView(entry: AllergenEntryView): AllergenEntryAdminView {
  return {
    id: entry.id,
    code: entry.code,
    name: entry.name,
    official: entry.official,
    archivedAt: isoOrNull(entry.archivedAt),
  };
}

function toAdminView(category: AllergenCategoryView): AllergenCategoryAdminView {
  return {
    id: category.id,
    key: category.key,
    name: category.name,
    incoCategory: category.incoCategory,
    official: category.official,
    position: category.position,
    archivedAt: isoOrNull(category.archivedAt),
    entries: category.entries.map(toEntryAdminView),
  };
}
