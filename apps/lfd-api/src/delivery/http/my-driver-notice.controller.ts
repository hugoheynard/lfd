import {
  type AcknowledgeDriverNoticePayload,
  acknowledgeDriverNoticePayloadSchema,
  type MyDriverNoticeView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { AcknowledgeDriverNoticeCommand } from "../application/commands/acknowledge-driver-notice.command.js";
import { GetMyDriverNoticeQuery } from "../application/queries/get-my-driver-notice.query.js";

/**
 * **« Mes données »** — le texte d'information du livreur et son accusé de
 * lecture (`documentation/legal/rgpd-livreur.md`, §7 point 2), sous
 * `delivery_driving` comme « Ma tournée ».
 *
 * Hors de `ma-tournee/` : `ma-tournee/:roundId` prendrait `mes-donnees` pour
 * un identifiant de tournée. La personne n'est jamais un paramètre : c'est la
 * fiche de la requête — on ne lit et n'accuse que pour soi.
 */
@Controller("admin/livraison/mes-donnees")
@AdminSurface("delivery_driving")
export class MyDriverNoticeController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  notice(@StaffUserId() staffUserId: string): Promise<MyDriverNoticeView> {
    return this.queries.execute<GetMyDriverNoticeQuery, MyDriverNoticeView>(
      new GetMyDriverNoticeQuery(staffUserId),
    );
  }

  @Post("accuse")
  @HttpCode(HttpStatus.NO_CONTENT)
  async acknowledge(
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(acknowledgeDriverNoticePayloadSchema))
    payload: AcknowledgeDriverNoticePayload,
  ): Promise<void> {
    await this.commands.execute<AcknowledgeDriverNoticeCommand, void>(
      new AcknowledgeDriverNoticeCommand(staffUserId, payload.version),
    );
  }
}
