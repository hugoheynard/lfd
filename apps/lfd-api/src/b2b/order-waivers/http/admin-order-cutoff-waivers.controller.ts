import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  orderCutoffWaiverPayloadSchema,
  type OrderCutoffWaiverPayload,
  type OrderCutoffWaiverView,
} from "@lfd/contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import type { AuthenticatedStaffRequest } from "../../../platform/auth/staff-principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  GrantOrderCutoffWaiverCommand,
  ListOrderCutoffWaiversQuery,
  RevokeOrderCutoffWaiverCommand,
} from "../application/order-cutoff-waiver.commands.js";

/**
 * **Dérogations d'heure limite** — autoriser un client à commander en retard
 * pour une journée donnée.
 *
 * Surface murée par `@AdminSurface("b2b_order_waivers")`, une ressource **à
 * elle**. Ni `b2b_orders` — prendre une commande et rouvrir une journée de
 * production close ne sont pas le même geste, et quelqu'un qui saisit toute la
 * journée n'a pas à pouvoir faire le second. Ni `b2b_settings`, qui édite **la
 * règle** quand celle-ci accorde **une exception**.
 *
 * La dérogation est accordée d'abord, la commande passe ensuite — et elle peut
 * être passée par le CLIENT lui-même. C'est tout l'intérêt de l'objet : le
 * commercial décroche, décide, et le client finit sa commande en ligne.
 */
@Controller("admin/order-cutoff-waivers")
@AdminSurface("b2b_order_waivers")
export class AdminOrderCutoffWaiversController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Les dérogations d'un client, la plus récente d'abord. */
  @Get(":companyId")
  async list(@Param("companyId") companyId: string): Promise<readonly OrderCutoffWaiverView[]> {
    return this.queries.execute<ListOrderCutoffWaiversQuery, readonly OrderCutoffWaiverView[]>(
      new ListOrderCutoffWaiversQuery(companyId),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async grant(
    @Req() request: AuthenticatedStaffRequest,
    @Body(new ZodBody(orderCutoffWaiverPayloadSchema)) payload: OrderCutoffWaiverPayload,
  ): Promise<{ id: string }> {
    const id = await this.commands.execute<GrantOrderCutoffWaiverCommand, string>(
      new GrantOrderCutoffWaiverCommand(payload, staffUserIdOf(request)),
    );
    return { id };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param("id") id: string): Promise<void> {
    await this.commands.execute<RevokeOrderCutoffWaiverCommand, void>(
      new RevokeOrderCutoffWaiverCommand(id),
    );
  }
}

/**
 * Qui accorde, résolu par `StaffAccessGuard`. On refuse plutôt que d'écrire une
 * décision sans auteur : c'est ce nom-là qui distingue une dérogation d'un trou
 * dans la règle.
 */
function staffUserIdOf(request: AuthenticatedStaffRequest): string {
  const staffUserId = request.access?.staffUserId;
  if (staffUserId === undefined || staffUserId === "") {
    throw new UnauthorizedException("Identité staff absente de la requête.");
  }
  return staffUserId;
}
