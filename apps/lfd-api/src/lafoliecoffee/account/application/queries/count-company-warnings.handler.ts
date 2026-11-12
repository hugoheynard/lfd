import type { CompanyWarningsCountView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CompanyWarningsCounter } from "../../domain/ports/company-warnings.counter.js";
import { CountCompanyWarningsQuery } from "./count-company-warnings.query.js";

/**
 * Lecture admin cross-tenant : délègue au `CompanyWarningsCounter`. Une
 * lecture ne mute rien.
 */
@QueryHandler(CountCompanyWarningsQuery)
export class CountCompanyWarningsHandler implements IQueryHandler<
  CountCompanyWarningsQuery,
  CompanyWarningsCountView
> {
  constructor(private readonly counter: CompanyWarningsCounter) {}

  async execute(): Promise<CompanyWarningsCountView> {
    return { count: await this.counter.count() };
  }
}
