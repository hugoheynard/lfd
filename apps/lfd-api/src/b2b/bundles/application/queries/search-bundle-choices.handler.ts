import type { BundleChoiceCandidateView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { BundleChoiceSearch } from "../../domain/ports/bundle-choice.search.js";
import { SearchBundleChoicesQuery } from "./search-bundle-choices.query.js";

/** Ce qu'une liste de propositions affiche sans défiler à l'infini. */
export const BUNDLE_CHOICE_SEARCH_LIMIT = 30;

/**
 * La recherche de l'éditeur : seulement les articles servis au public et pas
 * réservés aux opérations (§4.2) — l'écran ne propose pas ce que
 * l'enregistrement refuserait.
 */
@QueryHandler(SearchBundleChoicesQuery)
export class SearchBundleChoicesHandler implements IQueryHandler<
  SearchBundleChoicesQuery,
  readonly BundleChoiceCandidateView[]
> {
  constructor(private readonly search: BundleChoiceSearch) {}

  async execute(query: SearchBundleChoicesQuery): Promise<readonly BundleChoiceCandidateView[]> {
    const articles = await this.search.search(query.term, BUNDLE_CHOICE_SEARCH_LIMIT);
    return articles.map((article) => ({
      sku: article.sku,
      name: article.name,
      shelf: article.shelf,
      thumbnailUrl: article.thumbnailUrl,
    }));
  }
}
