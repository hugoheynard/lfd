import type { StaffNoticeAudiencesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffNoticeAudienceReader } from "../../domain/notice-audience/staff-notice-audience.ports.js";
import { ListStaffNoticeAudiencesQuery } from "./list-staff-notice-audiences.query.js";

/** L'écran Admin › Destinataires des avis, en une lecture. */
@QueryHandler(ListStaffNoticeAudiencesQuery)
export class ListStaffNoticeAudiencesHandler implements IQueryHandler<
  ListStaffNoticeAudiencesQuery,
  StaffNoticeAudiencesView
> {
  constructor(private readonly reader: StaffNoticeAudienceReader) {}

  execute(): Promise<StaffNoticeAudiencesView> {
    return this.reader.all();
  }
}
