import { QuoteOrderQuery } from "../application/queries/quote-order.handler.js";
import { AdminSurface } from "../../infra/auth/admin-surface.decorator.js";
import {
  type AdminOrderRow,
  type AdminOrdersQuery,
  adminOrdersQuerySchema,
  type AdminPlaceOrderPayload,
  adminPlaceOrderPayloadSchema,
  type AdminPlacedOrderResponse,
  type OrderView,
  orderQuotePayloadSchema,
  type OrderQuotePayload,
  type OrderQuoteView,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import type { AuthenticatedStaffRequest } from "../../infra/auth/staff-principal.js";
import { ZodBody, ZodQuery } from "../../shared/http/zod-body.pipe.js";
import {
  PlaceOrderForCustomerCommand,
  type PlaceOrderForCustomerResult,
} from "../application/commands/place-order-for-customer.command.js";
import { GetAdminOrderQuery } from "../application/queries/get-admin-order.query.js";
import { ListAdminOrdersQuery } from "../application/queries/list-admin-orders.query.js";

/**
 * Les commandes **vues du staff** — et, depuis la saisie assistée, prises par
 * lui.
 *
 * Surface staff murée par `@AdminSurface` : identité vérifiée, puis périmètre.
 * L'action se déduit du verbe — `GET` demande `orders:read`, le `POST` demande
 * `orders:write`.
 *
 * **Toujours pas de mutation d'une commande existante.** La faire avancer ou
 * l'annuler sont des décisions de production, pas des boutons d'écran ; elles
 * viendront avec les avenants (cf. `architecture-commande-immuable-avenants.md`).
 * Saisir une commande neuve pour un client n'entre pas en contradiction avec
 * cela : on ajoute un fait, on n'en réécrit aucun.
 */
@Controller("admin/orders")
@AdminSurface("orders")
export class AdminOrdersController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /**
   * **Ce que la commande coûterait**, avant de la passer.
   *
   * Le panier affichait le tarif du catalogue pendant que `POST` facturait le
   * prix résolu. Cette route rend le prix que la validation appliquera, calculé
   * par la MÊME résolution — pas par une seconde arithmétique qui aurait fini
   * par diverger d'un centime, devant le client.
   *
   * Un `POST` bien qu'elle ne mute rien : le contenu du panier ne tient pas dans
   * une chaîne de requête, et le mettre en `GET` le ferait traîner dans les
   * journaux d'accès.
   */
  @Post("quote")
  @HttpCode(HttpStatus.OK)
  async quote(
    @Req() request: AuthenticatedStaffRequest,
    @Body(new ZodBody(orderQuotePayloadSchema)) payload: OrderQuotePayload,
  ): Promise<OrderQuoteView> {
    return this.queries.execute<QuoteOrderQuery, OrderQuoteView>(
      new QuoteOrderQuery(staffUserIdOf(request), payload),
    );
  }

  /** Les commandes, la plus récente en tête, filtrables par société et par état. */
  @Get()
  async list(
    @Query(new ZodQuery(adminOrdersQuerySchema)) filters: AdminOrdersQuery,
  ): Promise<readonly AdminOrderRow[]> {
    return this.queries.execute<ListAdminOrdersQuery, readonly AdminOrderRow[]>(
      new ListAdminOrdersQuery(filters),
    );
  }

  /**
   * Passe une commande **au nom d'un client** — au téléphone, en clientèle, ou
   * quand le client n'a pas encore d'accès.
   *
   * L'identité du saisisseur vient de la **porte**, jamais du corps : un client
   * au nom de qui commander se choisit à l'écran, l'auteur d'une trace ne se
   * choisit pas.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async place(
    @Req() request: AuthenticatedStaffRequest,
    @Body(new ZodBody(adminPlaceOrderPayloadSchema)) payload: AdminPlaceOrderPayload,
  ): Promise<AdminPlacedOrderResponse> {
    const placed = await this.commands.execute<
      PlaceOrderForCustomerCommand,
      PlaceOrderForCustomerResult
    >(new PlaceOrderForCustomerCommand(staffUserIdOf(request), payload));
    // `exactOptionalPropertyTypes` : `paymentUrl` est présent ou absent, jamais
    // présent-et-indéfini.
    return placed.paymentUrl === undefined
      ? {
          id: placed.id,
          orderNumber: placed.orderNumber,
          settlement: placed.settlement,
          totalCents: placed.totalCents,
        }
      : {
          id: placed.id,
          orderNumber: placed.orderNumber,
          settlement: placed.settlement,
          totalCents: placed.totalCents,
          paymentUrl: placed.paymentUrl,
        };
  }

  /** Une commande, dans la même vue que celle du client — délibérément. */
  @Get(":id")
  async one(@Param("id") id: string): Promise<OrderView> {
    return this.queries.execute<GetAdminOrderQuery, OrderView>(new GetAdminOrderQuery(id));
  }
}

/**
 * Qui saisit, résolu par `StaffAccessGuard`. Le `?` du type l'autorise à
 * manquer ; en pratique le guard a couru avant nous, mais on refuse plutôt que
 * d'écrire une commande sans auteur — c'est cette colonne qui distingue une
 * commande saisie d'une commande passée par le client.
 */
function staffUserIdOf(request: AuthenticatedStaffRequest): string {
  const staffUserId = request.access?.staffUserId;
  if (staffUserId === undefined || staffUserId === "") {
    throw new UnauthorizedException("Identité staff absente de la requête.");
  }
  return staffUserId;
}
