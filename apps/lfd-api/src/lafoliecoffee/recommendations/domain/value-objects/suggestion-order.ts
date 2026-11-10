import { STAFF_SUGGESTION_ORDERS, type StaffSuggestionOrder } from "@lfd/contracts";

import { UnknownSuggestionOrderError } from "../errors/staff-suggestion-errors.js";

/** @throws {UnknownSuggestionOrderError} ni `recent`, ni `priority`. */
export function suggestionOrder(raw: string): StaffSuggestionOrder {
  const order = STAFF_SUGGESTION_ORDERS.find((known) => known === raw);
  if (order === undefined) {
    throw new UnknownSuggestionOrderError(raw);
  }
  return order;
}
