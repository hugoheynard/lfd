import type { AccessibilityFollowUpView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { AccessibilityFollowUpReader } from "../domain/accessibility-follow-up.reader.js";
import { GetAccessibilityFollowUpQuery } from "./get-accessibility-follow-up.query.js";

/** Sert le suivi d'accessibilité. Lecture pure, sans base : il est embarqué. */
@QueryHandler(GetAccessibilityFollowUpQuery)
export class GetAccessibilityFollowUpHandler implements IQueryHandler<
  GetAccessibilityFollowUpQuery,
  AccessibilityFollowUpView
> {
  constructor(private readonly followUp: AccessibilityFollowUpReader) {}

  execute(): Promise<AccessibilityFollowUpView> {
    return Promise.resolve(this.followUp.read());
  }
}
