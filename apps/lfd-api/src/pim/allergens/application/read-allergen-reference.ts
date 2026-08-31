import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import {
  readLocalized,
  type AllergenEntry,
  type AllergenReference,
  type AllergenScope,
  type Locale,
} from "@lfd/pim-contracts";

import {
  AllergenCatalogueReader,
  type AllergenCategoryView,
} from "../domain/ports/allergen-catalogue.reader.js";

/**
 * Le référentiel tel qu'on le **propose à la saisie**, pour un périmètre donné.
 *
 * @param scope `eu` = ce que je déclare en Europe, `world` = tout.
 * @param locale la langue d'aplatissement des libellés — le fil ne porte qu'une
 *   chaîne par entrée, et c'est le lecteur qui sait laquelle il veut.
 */
export class ReadAllergenReferenceQuery {
  constructor(
    readonly scope: AllergenScope,
    readonly locale: Locale,
  ) {}
}

/**
 * **Le catalogue de saisie** — servi depuis la base depuis le rebranchement.
 *
 * Deux filtres, et les confondre casse la fonctionnalité :
 *
 * - **le périmètre (D2)**. `eu` ne veut pas dire « porte une catégorie de
 *   l'annexe II » mais « ce que je déclare en Europe » : les 14 catégories
 *   réglementaires **plus toutes les catégories maison**. Filtrer sur
 *   `incoCategory !== null` rendrait un allergène maison créable et jamais
 *   cochable, puisque le formulaire produit démarre sur `eu` — le référentiel
 *   deviendrait administrable et la déclaration ne le verrait pas.
 * - **l'archivage (D2 bis)**. Ce qui est archivé n'est plus PROPOSÉ, alors que
 *   `knownCodes()` continue de le RECONNAÎTRE : une déclaration enregistrée
 *   hier cite un code que le staff archive demain, et la relire ne doit pas la
 *   déclarer invalide.
 *
 * `toInco()`, lui, ne connaît toujours que les 14 : une entrée maison est
 * déclarable et n'apparaîtra jamais comme une mention réglementaire.
 */
@QueryHandler(ReadAllergenReferenceQuery)
export class ReadAllergenReferenceHandler implements IQueryHandler<
  ReadAllergenReferenceQuery,
  AllergenReference
> {
  constructor(private readonly catalogue: AllergenCatalogueReader) {}

  async execute(query: ReadAllergenReferenceQuery): Promise<AllergenReference> {
    const categories = await this.catalogue.catalogue();
    const entries: AllergenEntry[] = [];
    for (const category of categories) {
      if (category.archivedAt !== null || !declarableIn(query.scope, category)) {
        continue;
      }
      const incoLabel =
        category.incoCategory === null ? null : readLocalized(category.name, query.locale);
      for (const entry of category.entries) {
        if (entry.archivedAt !== null) {
          continue;
        }
        entries.push({
          code: entry.code,
          label: readLocalized(entry.name, query.locale),
          incoCategory: category.incoCategory,
          incoLabel,
        });
      }
    }
    return { scope: query.scope, entries };
  }
}

/**
 * Le prédicat de périmètre, écrit une fois.
 *
 * `world` prend tout. `eu` prend l'annexe II **et** le maison — c'est-à-dire
 * tout sauf les catégories officielles sans mention INCO, dont il n'existe
 * qu'une : « hors obligation UE », qui accueille le sarrasin, le maïs et la noix
 * de coco.
 */
function declarableIn(scope: AllergenScope, category: AllergenCategoryView): boolean {
  return scope === "world" || category.incoCategory !== null || !category.official;
}
