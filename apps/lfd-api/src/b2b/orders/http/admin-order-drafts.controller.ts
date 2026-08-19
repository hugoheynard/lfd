import {
  orderDraftPayloadSchema,
  type OrderDraftPayload,
  type OrderDraftResponse,
  type OrderDraftView,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import type { AuthenticatedStaffRequest } from "../../../platform/auth/staff-principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { DiscardOrderDraftCommand } from "../application/commands/discard-order-draft.command.js";
import { SaveOrderDraftCommand } from "../application/commands/save-order-draft.command.js";
import { GetOrderDraftQuery } from "../application/queries/get-order-draft.query.js";

/**
 * Les **brouillons de commande** du back-office — une saisie interrompue,
 * reprise depuis n'importe quel poste.
 *
 * Ressource `orders` : c'est la même surface, au même droit. `PUT` et non `POST`
 * parce que l'opération est un **remplacement** de la seule ressource qui
 * existe pour cette société — la rejouer deux fois ne crée pas deux brouillons.
 *
 * Le brouillon est **partagé par l'équipe**, pas privé à qui l'a écrit : c'est
 * le compte qu'on sert. La trace `savedByStaffId` dit à qui demander quand deux
 * saisies se croisent.
 */
@Controller("admin/order-drafts")
@AdminSurface("orders")
export class AdminOrderDraftsController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /** Le brouillon de cette société — `{ draft: null }` s'il n'y en a pas. */
  @Get(":companyId")
  async one(@Param("companyId") companyId: string): Promise<OrderDraftResponse> {
    const draft = await this.queries.execute<GetOrderDraftQuery, OrderDraftView | null>(
      new GetOrderDraftQuery(companyId),
    );
    return { draft };
  }

  /** Met la saisie de côté. L'auteur vient de la porte, jamais du corps. */
  @Put(":companyId")
  async save(
    @Req() request: AuthenticatedStaffRequest,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(orderDraftPayloadSchema)) payload: OrderDraftPayload,
  ): Promise<OrderDraftView> {
    return this.commands.execute<SaveOrderDraftCommand, OrderDraftView>(
      new SaveOrderDraftCommand(companyId, staffUserIdOf(request), payload),
    );
  }

  /** Jette le brouillon. Idempotent — `204` même s'il n'y en avait pas. */
  @Delete(":companyId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async discard(@Param("companyId") companyId: string): Promise<void> {
    await this.commands.execute<DiscardOrderDraftCommand, void>(
      new DiscardOrderDraftCommand(companyId),
    );
  }
}

/** Qui enregistre, résolu par `StaffAccessGuard` — cf. `AdminOrdersController`. */
function staffUserIdOf(request: AuthenticatedStaffRequest): string {
  const staffUserId = request.access?.staffUserId;
  if (staffUserId === undefined || staffUserId === "") {
    throw new UnauthorizedException("Identité staff absente de la requête.");
  }
  return staffUserId;
}
