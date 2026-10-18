import type { StaffSuggestionChoicesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { SuggestionChoicesReader } from "../../domain/ports/suggestion-choices.reader.js";
import { ListStaffSuggestionChoicesQuery } from "./list-staff-suggestion-choices.query.js";

/**
 * Sous `lfc_suggestions` et non sous le droit du catalogue : qui compose une
 * suggestion doit pouvoir choisir un article sans recevoir le paramétrage des
 * prix. La lecture ne rend ni prix ni réglage.
 */
@QueryHandler(ListStaffSuggestionChoicesQuery)
export class ListStaffSuggestionChoicesHandler implements IQueryHandler<
  ListStaffSuggestionChoicesQuery,
  StaffSuggestionChoicesView
> {
  constructor(private readonly choices: SuggestionChoicesReader) {}

  execute(): Promise<StaffSuggestionChoicesView> {
    return this.choices.choices();
  }
}
