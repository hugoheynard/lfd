import type { MyDriverNoticeView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DriverNoticeAcknowledgementsReader } from "../../domain/ports/driver-notice-acknowledgements.reader.js";
import { CURRENT_DRIVER_NOTICE } from "../../domain/value-objects/driver-information-notice.js";
import { GetMyDriverNoticeQuery } from "./get-my-driver-notice.query.js";

/**
 * « Dois-je voir le texte ? » — l'accusé de la version COURANTE seule : une
 * nouvelle version rend `acknowledgedAt` nul, et le dialogue se rouvre une fois.
 */
@QueryHandler(GetMyDriverNoticeQuery)
export class GetMyDriverNoticeHandler implements IQueryHandler<
  GetMyDriverNoticeQuery,
  MyDriverNoticeView
> {
  constructor(private readonly acknowledgements: DriverNoticeAcknowledgementsReader) {}

  async execute(query: GetMyDriverNoticeQuery): Promise<MyDriverNoticeView> {
    const notice = CURRENT_DRIVER_NOTICE;
    const at = await this.acknowledgements.acknowledgedAt(query.staffUserId, notice.version);
    return {
      notice: {
        version: notice.version,
        title: notice.title,
        intro: notice.intro,
        sections: notice.sections.map((section) => ({
          heading: section.heading,
          lines: [...section.lines],
        })),
      },
      acknowledgedAt: at === null ? null : at.toISOString(),
    };
  }
}
