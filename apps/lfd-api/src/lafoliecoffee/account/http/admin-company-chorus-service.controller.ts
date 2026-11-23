import { type ChorusServicePayload, chorusServicePayloadSchema } from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { RecordChorusServiceCommand } from "../application/commands/record-chorus-service.command.js";

/**
 * La fiche du service Chorus d'une société qui commande — code service et
 * engagement en cours —, posée par le staff à réception du bon. Même surface
 * et même droit (`b2b_companies`, en écriture) que la fiche Chorus Pro
 * ({@link AdminCompanyChorusRoutingController}).
 */
@Controller("admin/companies")
@AdminSurface("b2b_companies")
export class AdminCompanyChorusServiceController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * Pose la fiche entière ; `204`. `409` si le payeur n'est pas public, ou si
   * un code service est posé sur une société qui est son propre payeur.
   */
  @Put(":companyId/chorus-service")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent("pose la fiche entière : rejouée, la même fiche est retrouvée et rien n'est écrit")
  async recordChorusService(
    @Param("companyId") companyId: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(chorusServicePayloadSchema)) payload: ChorusServicePayload,
  ): Promise<void> {
    await this.commands.execute<RecordChorusServiceCommand, void>(
      new RecordChorusServiceCommand(companyId, staffUserId, payload),
    );
  }
}
