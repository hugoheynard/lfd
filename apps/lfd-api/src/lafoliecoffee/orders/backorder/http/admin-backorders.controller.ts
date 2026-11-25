import {
  type AdminBackorderListQuery,
  adminBackorderListQuerySchema,
  type AdminBackorderView,
  type AdminBackorderConvertPayload,
  adminBackorderConvertPayloadSchema,
  type AdminBackorderQuotePayload,
  adminBackorderQuotePayloadSchema,
  type AdminOrderEstimateView,
  type AdminPlacedOrderResponse,
  hasStaffPermission,
  type StaffPermission,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import {
  AdminSurface,
  RequirePermission,
} from "../../../../platform/auth/admin-surface.decorator.js";
import { StaffPermissions, StaffUserId } from "../../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../../platform/shared/http/idempotent.decorator.js";
import { IntentKey } from "../../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody, ZodQuery } from "../../../../platform/shared/http/zod-body.pipe.js";
import type { PlaceOrderForCustomerResult } from "../../application/commands/place-order-for-customer.command.js";
import { mayExceedItemLimits } from "../../http/item-limit-override-permissions.js";
import { ConvertBackorderCommand } from "../application/commands/convert-backorder.command.js";
import { QuoteBackorderQuery } from "../application/queries/quote-backorder.query.js";
import { AbandonBackorderCommand } from "../application/commands/abandon-backorder.command.js";
import { ListBackordersQuery } from "../application/queries/list-backorders.query.js";

/**
 * **Le reliquat de commande, vu de l'équipe** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 4) :
 * la liste « Reliquats à traiter », l'estimer, le transformer en commande ou
 * l'abandonner. C'est l'écran qui appelle ces
 * routes, jamais `POST /admin/orders` : une passation ordinaire ne fermerait
 * pas le reliquat et facturerait le prix du jour.
 *
 * Transformer est sous le droit de la saisie de l'équipe : c'est passer une
 * commande à la place du client. Abandonner est sous le droit de la décision
 * du départ, qui fait naître le reliquat.
 */
@Controller("admin/backorders")
@AdminSurface("b2b_orders")
export class AdminBackordersController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * **La liste**, du plus ancien au plus récent : `?state=` (`open` par
   * défaut), `?companyId=` facultatif. Sans société, les reliquats de
   * particuliers y sont aussi : la surface est celle de l'équipe.
   */
  @Get()
  async list(
    @Query(new ZodQuery(adminBackorderListQuerySchema)) params: AdminBackorderListQuery,
  ): Promise<readonly AdminBackorderView[]> {
    return this.queries.execute<ListBackordersQuery, readonly AdminBackorderView[]>(
      new ListBackordersQuery({ state: params.state, companyId: params.companyId ?? null }),
    );
  }

  /**
   * **Abandonner** : le client ne veut pas du reste. `204` : la commande
   * d'origine se relit. Refus `409` : déjà transformé ou abandonné.
   */
  @Post(":id/abandon")
  @RequirePermission("b2b_orders_shortfall:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "transition : rejouée, le reliquat relu sous verrou est déjà fermé et l'agrégat refuse (409 « déjà abandonné ») avant toute écriture",
  )
  async abandon(@Param("id") id: string, @StaffUserId() staffUserId: string): Promise<void> {
    await this.commands.execute<AbandonBackorderCommand, void>(
      new AbandonBackorderCommand(staffUserId, id),
    );
  }

  @Post(":id/quote")
  @RequirePermission("b2b_place_order:write")
  @HttpCode(HttpStatus.OK)
  @Idempotent(
    "calcul pur en POST : compose la commande issue du reliquat en mémoire, n'écrit rien et n'envoie rien",
  )
  async quote(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(adminBackorderQuotePayloadSchema)) payload: AdminBackorderQuotePayload,
    @StaffPermissions() permissions: readonly StaffPermission[],
  ): Promise<AdminOrderEstimateView> {
    return this.queries.execute<QuoteBackorderQuery, AdminOrderEstimateView>(
      new QuoteBackorderQuery(staffUserId, id, payload, mayExceedItemLimits(permissions)),
    );
  }

  /**
   * Une fois par intention : l'écran envoie sa clé (`Idempotency-Key`), tirée
   * une fois par transformation voulue ; un double clic rend la même commande.
   */
  @Post(":id/convert")
  @RequirePermission("b2b_place_order:write")
  @HttpCode(HttpStatus.CREATED)
  async convert(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(adminBackorderConvertPayloadSchema)) payload: AdminBackorderConvertPayload,
    @IntentKey() intentKey: string,
    @StaffPermissions() permissions: readonly StaffPermission[],
  ): Promise<AdminPlacedOrderResponse> {
    const placed = await this.commands.execute<
      ConvertBackorderCommand,
      PlaceOrderForCustomerResult
    >(
      new ConvertBackorderCommand(
        staffUserId,
        id,
        payload,
        intentKey,
        mayExceedItemLimits(permissions),
        hasStaffPermission(permissions, "b2b_offer_order:write"),
      ),
    );
    const { paymentUrl, ...placedOrder } = placed;
    return paymentUrl === undefined ? placedOrder : { ...placedOrder, paymentUrl };
  }
}
