import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { AcquisitionMetricsView } from "@lfd/contracts";

import { AcquisitionMetricsReader } from "../../domain/ports/acquisition-metrics.reader.js";
import { GetAcquisitionMetricsQuery } from "./get-acquisition-metrics.query.js";

@QueryHandler(GetAcquisitionMetricsQuery)
export class GetAcquisitionMetricsHandler
  implements IQueryHandler<GetAcquisitionMetricsQuery, AcquisitionMetricsView>
{
  constructor(private readonly reader: AcquisitionMetricsReader) {}

  execute(): Promise<AcquisitionMetricsView> {
    return this.reader.load();
  }
}
