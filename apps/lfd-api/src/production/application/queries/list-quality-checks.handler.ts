import type { QualityChecksView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { QualityCheckReader } from "../../domain/ports/quality-check.reader.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { newestFirst, qualityCheckViewOf } from "../services/quality-views.js";
import { ListQualityChecksQuery } from "./list-quality-checks.query.js";

/**
 * Tous les verdicts, du plus récent au plus ancien : « qui a bloqué, pourquoi,
 * qui a levé, quand » (D2). Les auteurs sont nommés d'une lecture, comme au
 * colisage. Il n'écrit rien — §4.
 */
@QueryHandler(ListQualityChecksQuery)
export class ListQualityChecksHandler implements IQueryHandler<
  ListQualityChecksQuery,
  QualityChecksView
> {
  constructor(
    private readonly checks: QualityCheckReader,
    private readonly staffAuthors: StaffAuthorDirectory,
  ) {}

  async execute(query: ListQualityChecksQuery): Promise<QualityChecksView> {
    const day = ServiceDay.of(query.serviceDay);
    const checks = [...(await this.checks.forDay(day))].sort(newestFirst);
    const authors = await this.staffAuthors.identify(checks.map((check) => check.checkedBy));
    return {
      date: day.value,
      checks: checks.map((check) => qualityCheckViewOf(check, authors.nameOf(check.checkedBy))),
    };
  }
}
