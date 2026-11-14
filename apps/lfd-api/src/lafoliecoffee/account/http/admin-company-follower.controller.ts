import {
  assignCompanyFollowerPayloadSchema,
  type AssignCompanyFollowerPayload,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AssignCompanyFollowerCommand } from "../application/commands/assign-company-follower.command.js";

/**
 * **Le commercial qui suit une fiche** : la cheffe des commerciaux le confie,
 * le réattribue ou le retire depuis le suivi commercial. Sous
 * `b2b_sales_oversight` — en écriture par le verbe —, pas sous les comptes
 * clients : décider qui travaille quelle fiche est un geste de pilotage.
 */
@Controller("admin/companies/:companyId")
@AdminSurface("b2b_sales_oversight")
export class AdminCompanyFollowerController {
  constructor(private readonly commands: CommandBus) {}

  /** Une fois par intention (`Idempotency-Key`) ; `followerStaffId: null` retire le suiveur. */
  @Put("follower")
  @HttpCode(HttpStatus.NO_CONTENT)
  async assign(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(assignCompanyFollowerPayloadSchema)) payload: AssignCompanyFollowerPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<AssignCompanyFollowerCommand, void>(
      new AssignCompanyFollowerCommand(companyId, payload.followerStaffId, staffUserId, intentKey),
    );
  }
}
