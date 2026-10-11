import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { MediaThresholdsReport } from "@lfd/ops-contract";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ReadMediaThresholdsQuery } from "./read-media-thresholds.query.js";

/**
 * Les seuils de la médiathèque, pour la carte OPS. **Staff only**, lecture
 * seule, comme toute la surface OPS.
 */
@Controller("admin/ops/media")
@AdminSurface("ops_health")
export class AdminMediaThresholdsController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  read(): Promise<MediaThresholdsReport> {
    return this.queries.execute<ReadMediaThresholdsQuery, MediaThresholdsReport>(
      new ReadMediaThresholdsQuery(),
    );
  }
}
