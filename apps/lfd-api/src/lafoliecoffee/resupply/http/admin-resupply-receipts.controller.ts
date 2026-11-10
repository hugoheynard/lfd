import {
  type CorrectReceiptLinePayload,
  correctReceiptLineSchema,
  type ReceiveUnorderedReceiptLinePayload,
  receiveUnorderedReceiptLineSchema,
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
import { CorrectReceivedResupplyLineCommand } from "../application/correct-received-resupply-line.command.js";
import { CorrectUnorderedReceiptLineCommand } from "../application/correct-unordered-receipt-line.command.js";
import { GetResupplyReceiptQuery } from "../application/get-resupply-receipt.query.js";
import { ListResupplyArticlesQuery } from "../application/list-resupply-articles.query.js";
import { ReceiveUnorderedReceiptLineCommand } from "../application/receive-unordered-receipt-line.command.js";
import { ReceiveSiteResupplyCommand } from "../application/receive-site-resupply.command.js";
import { WithdrawUnorderedReceiptLineCommand } from "../application/withdraw-unordered-receipt-line.command.js";
import { skuParam } from "./resupply-params.js";

/**
 * **La réception du réapprovisionnement** — Comptoir › Réassort boutique
 * (plan `limites-de-commande/jour-meme-sur-stock.md`, J1, 2026-10-21).
 *
 * Depuis le 2026-10-21 (R2) : un reçu par réassort envoyé —
 * « Réceptionner » d'un geste, puis la correction d'un écart par ligne — et
 * les routes `:siteId/:day/lines` tiennent le « réassort sans commande ».
 *
 * Sous `handover_counter`, le droit qui garde déjà l'onglet au back-office :
 * c'est le poste du comptoir qui voit arriver la marchandise (décision de Hugo, Q1).
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

  /** « Réceptionner » : l'attendu devient le reçu, d'un geste. */
  @Post(":siteId/resupplies/:resupplyId/receive")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  async receiveResupply(
    @Param("siteId") siteId: string,
    @Param("resupplyId") resupplyId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ReceiveSiteResupplyCommand, void>(
      new ReceiveSiteResupplyCommand(siteId, resupplyId, staffUserId),
    );
  }

  /** Un écart, après « Réceptionner » : le reçu d'une ligne corrigé. */
  @Patch(":siteId/resupplies/:resupplyId/lines/:sku")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  async correctReceived(
    @Param("siteId") siteId: string,
    @Param("resupplyId") resupplyId: string,
    @Param("sku", skuParam()) sku: string,
    @Body(new ZodBody(correctReceiptLineSchema)) body: CorrectReceiptLinePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<CorrectReceivedResupplyLineCommand, void>(
      new CorrectReceivedResupplyLineCommand(siteId, resupplyId, sku, body.quantity, staffUserId),
    );
  }

  @Post(":siteId/:day/lines")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  async receive(
    @Param("siteId") siteId: string,
    @Param("day", new ZodQuery(resupplyServiceDaySchema)) day: string,
    @Body(new ZodBody(receiveUnorderedReceiptLineSchema)) body: ReceiveUnorderedReceiptLinePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ReceiveUnorderedReceiptLineCommand, void>(
      new ReceiveUnorderedReceiptLineCommand(siteId, day, body.sku, body.quantity, staffUserId),
    );
  }

  @Patch(":siteId/:day/lines/:sku")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  async correct(
    @Param("siteId") siteId: string,
    @Param("day", new ZodQuery(resupplyServiceDaySchema)) day: string,
    @Param("sku", skuParam()) sku: string,
    @Body(new ZodBody(correctReceiptLineSchema)) body: CorrectReceiptLinePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<CorrectUnorderedReceiptLineCommand, void>(
      new CorrectUnorderedReceiptLineCommand(siteId, day, sku, body.quantity, staffUserId),
    );
  }

  @Delete(":siteId/:day/lines/:sku")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  async withdraw(
    @Param("siteId") siteId: string,
    @Param("day", new ZodQuery(resupplyServiceDaySchema)) day: string,
    @Param("sku", skuParam()) sku: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<WithdrawUnorderedReceiptLineCommand, void>(
      new WithdrawUnorderedReceiptLineCommand(siteId, day, sku, staffUserId),
    );
  }
}
