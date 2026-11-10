import { Body, Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { RetryCardRefundCommand } from "../application/commands/retry-card-refund.command.js";
import { SettleCardRefundElsewhereCommand } from "../application/commands/settle-card-refund-elsewhere.command.js";
import {
  type SettleElsewherePayload,
  settleElsewherePayloadSchema,
} from "./card-refund-payloads.js";

/**
 * **Les gestes d'équipe sur un remboursement par carte** (plan M2, §3.3,
 * §5.3, §5.5), sous la ressource `card_payments` — PAR DEMANDE, pas par
 * commande : une commande peut en porter plusieurs. Pas de vue de bandeau
 * ici : c'est le commerce qui la sert (`refundRequestsOf`, v13).
 *
 * `202` : aucune route n'attend le prestataire — elles vérifient l'état,
 * écrivent, et l'exécuteur part après validation ; l'écran relit.
 */
@Controller("admin/card-payments/refund-requests")
@AdminSurface("card_payments")
export class AdminCardRefundsController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * **« Relancer »** (§3.4). Refus : demande inconnue (404) ; en cours d'envoi,
   * émise et en attente de la banque, rendue, jamais tentée, ou une autre en
   * cours sur le même paiement (409, avec leur phrase).
   */
  @Post(":requestId/retry")
  @RequirePermission("card_payments:write")
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(@Param("requestId") requestId: string): Promise<void> {
    await this.commands.execute<RetryCardRefundCommand, void>(
      new RetryCardRefundCommand(requestId),
    );
  }

  /**
   * **« Rendu autrement »** (§5.5). Refus : demande inconnue (404) ; pas
   * arrêtée, ou plus rien à rendre (409) ; motif vide ou trop long (400).
   */
  @Post(":requestId/settle-elsewhere")
  @RequirePermission("card_payments:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  async settleElsewhere(
    @Param("requestId") requestId: string,
    @Body(new ZodBody(settleElsewherePayloadSchema)) payload: SettleElsewherePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SettleCardRefundElsewhereCommand, void>(
      new SettleCardRefundElsewhereCommand(requestId, staffUserId, payload.reason),
    );
  }
}
