import {
  type AdminOrderEstimateView,
  type CounterParticularOrderEstimatePayload,
  counterParticularOrderEstimatePayloadSchema,
  type CounterParticularOrderPayload,
  counterParticularOrderPayloadSchema,
  type CounterParticularPlacedOrderResponse,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  PlaceParticularOrderAtCounterCommand,
  type PlaceParticularOrderAtCounterResult,
} from "../application/commands/place-particular-order-at-counter.command.js";
import { EstimateParticularOrderAtCounterQuery } from "../application/queries/estimate-particular-order-at-counter.query.js";

/**
 * Surface de la **commande d'un particulier notée au comptoir**, à régler à
 * la caisse de la boutique
 * (`documentation/commandes/passation/plan-commande-particulier-reglee-en-boutique.md`, § 4–5).
 *
 * Deux routes à elle, distinctes de la saisie pro (§ 2 : ne pas mélanger les
 * deux saisies), sous le même droit (`b2b_place_order:write`) et la surface
 * du comptoir, comme la recherche des particuliers.
 */
@Controller("admin/counter/particular-orders")
@AdminSurface("b2b_counter")
export class AdminCounterParticularOrdersController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /** Ce que la commande coûterait, au centime — `POST` : le panier ne tient pas dans une URL. */
  @Post("estimate")
  @RequirePermission("b2b_place_order:write")
  @HttpCode(HttpStatus.OK)
  @Idempotent(
    "calcul pur en POST : compose le devis de la commande en mémoire, n'écrit rien et n'envoie rien",
  )
  estimate(
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(counterParticularOrderEstimatePayloadSchema))
    payload: CounterParticularOrderEstimatePayload,
  ): Promise<AdminOrderEstimateView> {
    return this.queries.execute<EstimateParticularOrderAtCounterQuery, AdminOrderEstimateView>(
      new EstimateParticularOrderAtCounterQuery(staffUserId, payload),
    );
  }

  /**
   * Note la commande. Une fois par intention : l'écran envoie sa clé
   * (`Idempotency-Key`), et un double clic rend la même commande.
   */
  @Post()
  @RequirePermission("b2b_place_order:write")
  @HttpCode(HttpStatus.CREATED)
  async place(
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(counterParticularOrderPayloadSchema)) payload: CounterParticularOrderPayload,
    @IntentKey() intentKey: string,
  ): Promise<CounterParticularPlacedOrderResponse> {
    const placed = await this.commands.execute<
      PlaceParticularOrderAtCounterCommand,
      PlaceParticularOrderAtCounterResult
    >(new PlaceParticularOrderAtCounterCommand(staffUserId, payload, intentKey));
    return { id: placed.id, orderNumber: placed.orderNumber, totalCents: placed.totalCents };
  }
}
