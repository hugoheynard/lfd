import {
  type PlacedSiteResupplyResponse,
  resupplyServiceDaySchema,
  type SendReserveToShopPayload,
  sendReserveToShopSchema,
} from "@lfd/contracts";
import { Body, Controller, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { SendReserveToShopCommand } from "../application/send-reserve-to-shop.command.js";

/**
 * **Envoyer en boutique depuis la réserve** (plan A1, lot A1.4,
 * `commandes/annulation/plan-a1-4-envoyer-en-boutique.md`) — le geste de
 * superviseur de la Supervision, sur le pain rendu par une annulation.
 *
 * Sous `production_resupply:write` (droit existant, lot R1d), accordé à
 * l'écran des rôles : envoyer un réassort au point, c'est le geste du
 * fournil. La journée de la réserve est dans l'URL ; le point, la clé de
 * l'écran et les lignes dans le corps.
 */
@Controller("admin/reserve-shop-releases")
@AdminSurface("production_resupply")
export class AdminReserveShopReleasesController {
  constructor(private readonly commands: CommandBus) {}

  @Post(":serviceDay")
  async send(
    @Param("serviceDay", new ZodQuery(resupplyServiceDaySchema)) serviceDay: string,
    @Body(new ZodBody(sendReserveToShopSchema)) body: SendReserveToShopPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<PlacedSiteResupplyResponse> {
    const id = await this.commands.execute<SendReserveToShopCommand, string>(
      new SendReserveToShopCommand(serviceDay, body.siteId, body.key, body.lines, staffUserId),
    );
    return { id };
  }
}
