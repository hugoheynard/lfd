import { type ChorusRoutingPayload, chorusRoutingPayloadSchema } from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { RecordChorusRoutingCommand } from "../application/commands/record-chorus-routing.command.js";

/**
 * La fiche Chorus Pro d'un organisme public, posée par le staff. Même surface
 * et même droit (`b2b_companies`, en écriture) que la correction d'identité
 * ({@link AdminCompanyPiecesController}) : relever l'annuaire Chorus complète
 * l'identité d'un acheteur public.
 */
@Controller("admin/companies")
@AdminSurface("b2b_companies")
export class AdminCompanyChorusRoutingController {
  constructor(private readonly commands: CommandBus) {}

  /** Pose la fiche entière ; `204`. `409` si la forme juridique n'est pas publique. */
  @Put(":companyId/chorus-routing")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent("pose la fiche entière : rejouée, le même relevé est retrouvé et rien n'est écrit")
  async recordChorusRouting(
    @Param("companyId") companyId: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(chorusRoutingPayloadSchema)) payload: ChorusRoutingPayload,
  ): Promise<void> {
    await this.commands.execute<RecordChorusRoutingCommand, void>(
      new RecordChorusRoutingCommand(companyId, staffUserId, payload),
    );
  }
}
