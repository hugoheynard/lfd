import type { StaffSuggestionChoicesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { SuggestionChoicesReader } from "../../domain/ports/suggestion-choices.reader.js";
import { SuggestionSiteChoicesReader } from "../../domain/ports/suggestion-site.reader.js";
import { ListStaffSuggestionChoicesQuery } from "./list-staff-suggestion-choices.query.js";

/**
 * Sous `lfc_suggestions` et non sous le droit du catalogue : qui compose une
 * suggestion doit pouvoir choisir un article sans recevoir le paramétrage des
 * prix. La lecture ne rend ni prix ni réglage — et des points de retrait,
 * seulement l'id et le nom des ouverts (RS8).
 */
@QueryHandler(ListStaffSuggestionChoicesQuery)
export class ListStaffSuggestionChoicesHandler implements IQueryHandler<
  ListStaffSuggestionChoicesQuery,
  StaffSuggestionChoicesView
> {
  constructor(
    private readonly choices: SuggestionChoicesReader,
    private readonly sites: SuggestionSiteChoicesReader,
  ) {}

  async execute(): Promise<StaffSuggestionChoicesView> {
    const [catalogue, sites] = await Promise.all([this.choices.choices(), this.sites.openSites()]);
    return { ...catalogue, sites };
  }
}
