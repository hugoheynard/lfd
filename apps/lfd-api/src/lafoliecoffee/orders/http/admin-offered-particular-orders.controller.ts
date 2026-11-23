import {
  hasStaffPermission,
  type OfferedParticularOrderPayload,
  offeredParticularOrderPayloadSchema,
  type OfferedParticularPlacedOrderResponse,
  type StaffPermission,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffPermissions, StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  PlaceOfferedParticularOrderCommand,
  type PlaceOfferedParticularOrderResult,
} from "../application/commands/place-offered-particular-order.command.js";

/**
 * Surface de la **commande offerte à un particulier**
 * (`documentation/commandes/passation/plan-commande-offerte.md`, § 2.4, O7-1).
 *
 * Sa route à elle : `POST /admin/orders` garde sa société obligatoire. La
 * porte exige le droit de saisir (`b2b_place_order:write`) ; le droit
 * d'offrir (`b2b_offer_order:write`) se garde au handler, au même endroit
 * que pour la saisie d'une société, et son refus est un `403`.
 */
@Controller("admin/offered-orders")
@AdminSurface("b2b_orders")
export class AdminOfferedParticularOrdersController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * Offre la commande. Une fois par intention : l'écran envoie sa clé
   * (`Idempotency-Key`), et un double clic rend la même commande.
   */
  @Post("particular")
  @RequirePermission("b2b_place_order:write")
  @HttpCode(HttpStatus.CREATED)
  async placeForParticular(
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(offeredParticularOrderPayloadSchema)) payload: OfferedParticularOrderPayload,
    @IntentKey() intentKey: string,
    @StaffPermissions() permissions: readonly StaffPermission[],
  ): Promise<OfferedParticularPlacedOrderResponse> {
    const placed = await this.commands.execute<
      PlaceOfferedParticularOrderCommand,
      PlaceOfferedParticularOrderResult
    >(
      new PlaceOfferedParticularOrderCommand(
        staffUserId,
        payload,
        intentKey,
        hasStaffPermission(permissions, "b2b_offer_order:write"),
      ),
    );
    return {
      id: placed.id,
      orderNumber: placed.orderNumber,
      totalCents: placed.totalCents,
      offeredTotalCents: placed.offeredTotalCents,
    };
  }
}
