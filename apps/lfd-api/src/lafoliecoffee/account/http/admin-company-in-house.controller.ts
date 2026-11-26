import {
  type InHousePayerPayload,
  inHousePayerPayloadSchema,
  type InHousePayerView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SetInHousePayerCommand } from "../application/commands/set-in-house-payer.command.js";
import { GetInHousePayerQuery } from "../application/queries/get-in-house-payer.query.js";

/**
 * **La nature « maison » d'un payeur**, sur sa fiche client
 * (`comptabilite/facturation/plan-restaurants-maison.md`, D1–D3). Se lit sous
 * `b2b_companies:read`, comme la fiche ; se pose sous
 * `b2b_in_house_payers:write`, un droit à part : marquer un restaurant change
 * la façon dont ses commandes seront réglées.
 */
@Controller("admin/companies")
@AdminSurface("b2b_companies")
export class AdminCompanyInHouseController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** La nature et l'instant du marquage ; `404` sur une société inconnue. */
  @Get(":companyId/in-house")
  read(@Param("companyId") companyId: string): Promise<InHousePayerView> {
    return this.queries.execute<GetInHousePayerQuery, InHousePayerView>(
      new GetInHousePayerQuery(companyId),
    );
  }

  /**
   * Marque ou démarque ; `204`, immédiat. `409` pour un organisme public, ou
   * un suivi de facturation entre deux natures. Une fois par intention de
   * l'écran (en-tête `Idempotency-Key`, obligatoire).
   */
  @Put(":companyId/in-house")
  @RequirePermission("b2b_in_house_payers:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  async set(
    @Param("companyId") companyId: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
    @Body(new ZodBody(inHousePayerPayloadSchema)) payload: InHousePayerPayload,
  ): Promise<void> {
    await this.commands.execute<SetInHousePayerCommand, void>(
      new SetInHousePayerCommand(companyId, staffUserId, payload.inHouse, intentKey),
    );
  }
}
