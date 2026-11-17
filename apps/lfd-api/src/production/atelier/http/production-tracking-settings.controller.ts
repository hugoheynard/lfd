import {
  type ProductionTrackingPayload,
  productionTrackingPayloadSchema,
  type ProductionTrackingView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SetProductionTrackingCommand } from "../application/commands/set-production-tracking.command.js";
import { GetProductionTrackingQuery } from "../application/queries/get-production-tracking.query.js";

/**
 * **Le niveau de suivi du fournil** (plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.1) — un réglage de
 * l'atelier, servi sous le préfixe et la surface des réglages du fournil
 * (`production_settings`), comme le rangement. Le niveau d'un poste se règle
 * par la route de son propriétaire (`workstations/`).
 *
 * Poser est **par intention** (`@IntentKey`). Il n'injecte que les bus.
 */
@Controller("admin/production/settings")
@AdminSurface("production_settings")
export class ProductionTrackingSettingsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get("tracking")
  tracking(): Promise<ProductionTrackingView> {
    return this.queries.execute<GetProductionTrackingQuery, ProductionTrackingView>(
      new GetProductionTrackingQuery(),
    );
  }

  /** Le niveau du fournil et sa marge ; ils valent à partir de la prochaine journée arrêtée. */
  @Put("tracking")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setTracking(
    @Body(new ZodBody(productionTrackingPayloadSchema)) body: ProductionTrackingPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<SetProductionTrackingCommand, void>(
      new SetProductionTrackingCommand(body.level, body.marginMinutes, staffUserId, intentKey),
    );
  }
}
