import { STAFF_SUGGESTION_AUDIENCES, type StaffSuggestionAudience } from "@lfd/contracts";

import { UnknownSuggestionAudienceError } from "../errors/staff-suggestion-errors.js";

/** @throws {UnknownSuggestionAudienceError} ni `pro`, ni `public`, ni `both`. */
export function suggestionAudience(raw: string): StaffSuggestionAudience {
  const audience = STAFF_SUGGESTION_AUDIENCES.find((known) => known === raw);
  if (audience === undefined) {
    throw new UnknownSuggestionAudienceError(raw);
  }
  return audience;
}
