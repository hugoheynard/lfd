import {
  type AdminOrderEstimateView,
  type AdminPlaceOrderPayload,
  adminPlaceOrderPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { EstimateOrderForCustomerQuery } from "../application/queries/estimate-order-for-customer.query.js";

/**
 * **Ce que la saisie de l'équipe coûterait, au centime**, avant de la passer
 * (plan `documentation/pricing/saisie/plan-prix-de-la-saisie.md`, lot P2).
 *
 * Même surface et même droit que `POST /admin/orders` — l'estimation précède
 * la passation, c'est le même geste (5.1 bis du plan des droits par geste).
 * Une route à part plutôt que `POST /admin/orders/quote` élargi : ce dernier a
 * deux autres lecteurs qui vivent de la trace par ligne (le simulateur de
 * tarification et la route client). Un contrôleur à part aussi : celui des
 * commandes dépassait déjà la taille admise.
 *
 * Un `POST` bien qu'elle n'écrive rien : le corps de la passation ne tient
 * pas dans une chaîne de requête.
 */
@Controller("admin/orders")
@AdminSurface("b2b_orders")
export class AdminOrderEstimatesController {
  constructor(private readonly queries: QueryBus) {}

  @Post("estimate")
  @RequirePermission("b2b_place_order:write")
  @HttpCode(HttpStatus.OK)
  async estimate(
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(adminPlaceOrderPayloadSchema)) payload: AdminPlaceOrderPayload,
  ): Promise<AdminOrderEstimateView> {
    return this.queries.execute<EstimateOrderForCustomerQuery, AdminOrderEstimateView>(
      new EstimateOrderForCustomerQuery(staffUserId, payload),
    );
  }
}
