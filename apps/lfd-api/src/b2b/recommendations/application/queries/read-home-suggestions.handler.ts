import type { HomeSuggestionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { homeTriggering, STAFF_HOME_PLACES } from "../../domain/services/home-suggestions.js";
import { StaffSuggestionShowcase } from "../services/staff-suggestion-showcase.js";
import { ReadHomeSuggestionsQuery } from "./read-home-suggestions.query.js";

/**
 * Les suggestions du staff à l'accueil : la vitrine commune
 * (`StaffSuggestionShowcase`) avec le seul déclencheur « partout », et deux
 * places. Le panier courant n'y sert qu'à exclure.
 */
@QueryHandler(ReadHomeSuggestionsQuery)
export class ReadHomeSuggestionsHandler implements IQueryHandler<
  ReadHomeSuggestionsQuery,
  readonly HomeSuggestionView[]
> {
  constructor(private readonly showcase: StaffSuggestionShowcase) {}

  execute(query: ReadHomeSuggestionsQuery): Promise<readonly HomeSuggestionView[]> {
    return this.showcase.show({
      placement: "home",
      companyId: query.companyId,
      inCart: query.skus,
      target: query.target,
      places: STAFF_HOME_PLACES,
      triggeringOf: () => Promise.resolve(homeTriggering()),
    });
  }
}
