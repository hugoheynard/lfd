import type { StaffSuggestionOrderView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { SuggestionOrderReader } from "../../domain/ports/suggestion-order.reader.js";
import { GetStaffSuggestionOrderQuery } from "./get-staff-suggestion-order.query.js";

@QueryHandler(GetStaffSuggestionOrderQuery)
export class GetStaffSuggestionOrderHandler implements IQueryHandler<
  GetStaffSuggestionOrderQuery,
  StaffSuggestionOrderView
> {
  constructor(private readonly order: SuggestionOrderReader) {}

  execute(): Promise<StaffSuggestionOrderView> {
    return this.order.current();
  }
}
