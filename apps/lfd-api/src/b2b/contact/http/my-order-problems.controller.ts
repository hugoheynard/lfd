import {
  type CreatedIdResponse,
  type OrderProblemPayload,
  orderProblemPayloadSchema,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { perAccountThrottleGuard } from "../../../platform/security/per-account-throttle.guard.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import type { UploadedPhotoPart } from "../../shared/photo-cards/http/photo-card-http.js";
import { ReportOrderProblemCommand } from "../application/commands/report-order-problem.command.js";
import { OrderProblemPhotosUpload, photoBytesOf } from "./order-problem-http.js";

/**
 * **3 signalements par 10 minutes et par COMPTE** (`demandes-clients.md`,
 * §6.3) : la route est connectée, le compte est la bonne clé ; « Nous
 * écrire » garde son débit par IP. Deux compteurs, assumés.
 */
export const OrderProblemThrottleGuard = perAccountThrottleGuard({
  name: "order-problem",
  limit: 3,
  windowMs: 600_000,
});

/**
 * **Signaler un problème** — `POST /me/orders/:id/problems`, en multipart :
 * les champs `reasonId` et `message`, et jusqu'à trois fichiers `photos`. La
 * personne vient du jeton ; nom et e-mail
 * sont pris au compte ; la société est celle de la COMMANDE, jamais l'espace
 * de travail (`plan-commandes-des-sites.md`, §7.3). Rend l'id de la demande.
 */
@Controller("me/orders/:orderId/problems")
export class MyOrderProblemsController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @UseGuards(OrderProblemThrottleGuard)
  @UseInterceptors(OrderProblemPhotosUpload)
  async report(
    @Param("orderId") orderId: string,
    @Body(new ZodBody(orderProblemPayloadSchema)) payload: OrderProblemPayload,
    @UploadedFiles() files: readonly UploadedPhotoPart[] | undefined,
    @CurrentUser() principal: Principal,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<ReportOrderProblemCommand, string>(
      new ReportOrderProblemCommand(orderId, payload, photoBytesOf(files), {
        userId: principal.userId,
      }),
    );
    return { id };
  }
}
