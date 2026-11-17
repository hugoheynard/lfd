import type { ProductionTrackingView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { ProductionTrackingSettings } from "../../domain/entities/production-tracking-settings.js";
import { ProductionTrackingSettingsReader } from "../../domain/ports/production-tracking-settings.ports.js";
import { GetProductionTrackingQuery } from "./get-production-tracking.query.js";

/** Le réglage courant, défaut compris : toujours vert, quinze minutes, tant que personne ne l'a posé. */
@QueryHandler(GetProductionTrackingQuery)
export class GetProductionTrackingHandler implements IQueryHandler<
  GetProductionTrackingQuery,
  ProductionTrackingView
> {
  constructor(private readonly reader: ProductionTrackingSettingsReader) {}

  async execute(): Promise<ProductionTrackingView> {
    const settings = (await this.reader.current()) ?? ProductionTrackingSettings.defaults();
    return { level: settings.level, marginMinutes: settings.marginMinutes };
  }
}
