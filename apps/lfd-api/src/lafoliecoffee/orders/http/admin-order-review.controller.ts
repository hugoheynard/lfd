import { type ReviewOrderPayload, reviewOrderPayloadSchema } from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReviewOrderCommand } from "../application/commands/review-order.command.js";
import { WithdrawOrderReviewCommand } from "../application/commands/withdraw-order-review.command.js";

/**
 * **Le visa des commandes** (`documentation/commandes/back-office/plan-visa-des-commandes.md`) :
 * un commercial vise une commande qu'un client pro a passée seul, ou retire
 * un visa. Une trace : rien ne se bloque. Les deux gestes portent la clé
 * d'intention de l'écran ; la commande se relit ensuite (`GET admin/orders/:id`).
 */
@Controller("admin/orders")
@AdminSurface("b2b_orders")
export class AdminOrderReviewController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * **Viser**. Corps `{ note?: string | null }`. `204`. Refus : commande
   * inconnue (`404`), hors périmètre ou déjà visée (`409`), note trop longue
   * (`400`).
   */
  @Post(":orderId/review")
  @RequirePermission("b2b_order_review:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  async review(
    @Param("orderId") orderId: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
    @Body(new ZodBody(reviewOrderPayloadSchema)) payload: ReviewOrderPayload,
  ): Promise<void> {
    await this.commands.execute<ReviewOrderCommand, void>(
      new ReviewOrderCommand(orderId, staffUserId, payload.note ?? null, intentKey),
    );
  }

  /** **Retirer le visa en cours**. `204`. Refus : commande inconnue (`404`), aucun visa (`409`). */
  @Post(":orderId/review/withdraw")
  @RequirePermission("b2b_order_review:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  async withdraw(
    @Param("orderId") orderId: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<WithdrawOrderReviewCommand, void>(
      new WithdrawOrderReviewCommand(orderId, staffUserId, intentKey),
    );
  }
}
