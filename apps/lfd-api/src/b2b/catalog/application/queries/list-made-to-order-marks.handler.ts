import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { MadeToOrderMarkView } from "@lfd/contracts";

import { MadeToOrderAdminReader } from "../../domain/ports/made-to-order-admin.reader.js";
import { ListMadeToOrderMarksQuery } from "./list-made-to-order-marks.query.js";

/**
 * Le badge « Sur mesure » et le compte de réservataires de chaque article du
 * catalogue publié, en une lecture (plan `plan-articles-sur-mesure.md`, § 7).
 */
@QueryHandler(ListMadeToOrderMarksQuery)
export class ListMadeToOrderMarksHandler implements IQueryHandler<
  ListMadeToOrderMarksQuery,
  MadeToOrderMarkView[]
> {
  constructor(private readonly reader: MadeToOrderAdminReader) {}

  async execute(): Promise<MadeToOrderMarkView[]> {
    return this.reader.marks();
  }
}
