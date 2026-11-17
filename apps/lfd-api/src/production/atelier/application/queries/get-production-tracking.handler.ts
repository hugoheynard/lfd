import type { ProductionTrackingView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ProductionTrackingSettings } from "../../domain/entities/production-tracking-settings.js";
import { ProductionTrackingSettingsReader } from "../../domain/ports/production-tracking-settings.ports.js";
import { TrackingLevelsCommissioning } from "../../domain/ports/tracking-levels-commissioning.js";
import { GetProductionTrackingQuery } from "./get-production-tracking.query.js";

/**
 * Le réglage courant, défaut compris : toujours vert, quinze minutes, tant que
 * personne ne l'a posé — et la mise en service, pour que la page dise si le
 * niveau choisi vaudra déjà à la prochaine journée arrêtée.
 */
@QueryHandler(GetProductionTrackingQuery)
export class GetProductionTrackingHandler implements IQueryHandler<
  GetProductionTrackingQuery,
  ProductionTrackingView
> {
  constructor(
    private readonly reader: ProductionTrackingSettingsReader,
    private readonly commissioning: TrackingLevelsCommissioning,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<ProductionTrackingView> {
    const settings = (await this.reader.current()) ?? ProductionTrackingSettings.defaults();
    const since = this.commissioning.since();
    return {
      level: settings.level,
      marginMinutes: settings.marginMinutes,
      inServiceSince: since.toISOString(),
      inService: since.getTime() <= this.clock.now().getTime(),
    };
  }
}
