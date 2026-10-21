import {
  type CorrectResupplyLinePayload,
  correctResupplyLineSchema,
  type ReceiveResupplyLinePayload,
  receiveResupplyLineSchema,
  type ResupplyArticleView,
  type ResupplyReceiptView,
  resupplyServiceDaySchema,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { CorrectResupplyLineCommand } from "../application/correct-resupply-line.command.js";
import { GetResupplyReceiptQuery } from "../application/get-resupply-receipt.query.js";
import { ListResupplyArticlesQuery } from "../application/list-resupply-articles.query.js";
import { ReceiveResupplyLineCommand } from "../application/receive-resupply-line.command.js";
import { WithdrawResupplyLineCommand } from "../application/withdraw-resupply-line.command.js";

/**
 * **La réception du réapprovisionnement** — Comptoir › Réassort boutique
 * (plan `limites-de-commande/plan-jour-meme-sur-stock.md`, J1, 2026-10-21).
 *
 * Sous `handover_counter`, le droit qui garde déjà l'onglet au back-office :
 * c'est le poste du comptoir qui voit arriver la marchandise (Q1, Hugo).
 * Les gestes rendent `204` ; l'écran relit.
 */
@Controller("admin/resupply-receipts")
@AdminSurface("handover_counter")
export class AdminResupplyReceiptsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Les articles proposables : le catalogue publié de la boutique, sans prix. */
  @Get("articles")
  @RequirePermission("handover_counter:read")
  articles(): Promise<readonly ResupplyArticleView[]> {
    return this.queries.execute<ListResupplyArticlesQuery, readonly ResupplyArticleView[]>(
      new ListResupplyArticlesQuery(),
    );
  }

  @Get(":siteId/:day")
  @RequirePermission("handover_counter:read")
  read(
    @Param("siteId") siteId: string,
    @Param("day", new ZodQuery(resupplyServiceDaySchema)) day: string,
  ): Promise<ResupplyReceiptView> {
    return this.queries.execute<GetResupplyReceiptQuery, ResupplyReceiptView>(
      new GetResupplyReceiptQuery(siteId, day),
    );
  }

  @Post(":siteId/:day/lines")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  async receive(
    @Param("siteId") siteId: string,
    @Param("day", new ZodQuery(resupplyServiceDaySchema)) day: string,
    @Body(new ZodBody(receiveResupplyLineSchema)) body: ReceiveResupplyLinePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ReceiveResupplyLineCommand, void>(
      new ReceiveResupplyLineCommand(siteId, day, body.sku, body.quantity, staffUserId),
    );
  }

  @Patch(":siteId/:day/lines/:sku")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  async correct(
    @Param("siteId") siteId: string,
    @Param("day", new ZodQuery(resupplyServiceDaySchema)) day: string,
    @Param("sku") sku: string,
    @Body(new ZodBody(correctResupplyLineSchema)) body: CorrectResupplyLinePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<CorrectResupplyLineCommand, void>(
      new CorrectResupplyLineCommand(siteId, day, sku, body.quantity, staffUserId),
    );
  }

  @Delete(":siteId/:day/lines/:sku")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  async withdraw(
    @Param("siteId") siteId: string,
    @Param("day", new ZodQuery(resupplyServiceDaySchema)) day: string,
    @Param("sku") sku: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<WithdrawResupplyLineCommand, void>(
      new WithdrawResupplyLineCommand(siteId, day, sku, staffUserId),
    );
  }
}
