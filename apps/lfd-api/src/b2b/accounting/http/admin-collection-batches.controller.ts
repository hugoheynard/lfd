import {
  constituteBatchesPayloadSchema,
  settleOrderOtherwisePayloadSchema,
  type CollectionCycleView,
  type CollectionPreviewView,
  type ConstituteBatchesPayload,
  type ConstitutedBatchesView,
  type SettleOrderOtherwisePayload,
} from "@lfd/contracts";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CancelCollectionBatchCommand } from "../application/commands/cancel-collection-batch.command.js";
import { ConstituteCollectionBatchesCommand } from "../application/commands/constitute-collection-batches.command.js";
import { DepositCollectionBatchCommand } from "../application/commands/deposit-collection-batch.command.js";
import { SettleOrderOtherwiseCommand } from "../application/commands/settle-order-otherwise.command.js";
import {
  ExportCollectionBatchAuditQuery,
  ExportCollectionBatchFileQuery,
  GetCollectionCycleQuery,
  GetCollectionPreviewQuery,
} from "../application/queries/collection-batch-queries.js";
import type { CollectionBatchAudit } from "../application/queries/export-collection-batch-audit.handler.js";
import type { CollectionBatchFile } from "../application/queries/export-collection-batch-file.handler.js";

/**
 * Surface **staff** des lots de prélèvement figés (plan
 * `documentation/comptabilite/plan-lot-de-prelevement-fige.md`, §4). L'action
 * se déduit du verbe : `GET` lit, le reste écrit (`b2b_accounting:write`).
 */
@Controller("admin/accounting/collection")
@AdminSurface("b2b_accounting")
export class AdminCollectionBatchesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /** Les lots d'une entité et les commandes écartées. */
  @Get("cycle")
  cycle(@Query("legalEntityId") legalEntityId: string): Promise<CollectionCycleView> {
    return this.queries.execute<GetCollectionCycleQuery, CollectionCycleView>(
      new GetCollectionCycleQuery(legalEntityId),
    );
  }

  /**
   * L'aperçu du mois qui court, calculé comme le lot — une lecture : rien
   * n'est écrit ni verrouillé (plan `plan-prelevement-automatique.md`, PA4).
   */
  @Get("preview")
  preview(@Query("legalEntityId") legalEntityId: string): Promise<CollectionPreviewView> {
    return this.queries.execute<GetCollectionPreviewQuery, CollectionPreviewView>(
      new GetCollectionPreviewQuery(legalEntityId),
    );
  }

  /** Constitue les lots du dernier cycle clos. 409 si rien n'a bougé. */
  @Post("batches")
  async constitute(
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(constituteBatchesPayloadSchema)) payload: ConstituteBatchesPayload,
  ): Promise<ConstitutedBatchesView> {
    const batchIds = await this.commands.execute<
      ConstituteCollectionBatchesCommand,
      readonly string[]
    >(new ConstituteCollectionBatchesCommand(payload.legalEntityId, staffUserId));
    return { batchIds };
  }

  @Post("batches/:id/cancel")
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(@StaffUserId() staffUserId: string, @Param("id") id: string): Promise<void> {
    await this.commands.execute<CancelCollectionBatchCommand, void>(
      new CancelCollectionBatchCommand(id, staffUserId),
    );
  }

  /** Relit mandats, comptes et commandes ; 409 nommant l'écart s'il y en a un. */
  @Post("batches/:id/deposit")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deposit(@StaffUserId() staffUserId: string, @Param("id") id: string): Promise<void> {
    await this.commands.execute<DepositCollectionBatchCommand, void>(
      new DepositCollectionBatchCommand(id, staffUserId),
    );
  }

  /** Le fichier STOCKÉ — mêmes octets à chaque téléchargement, empreinte vérifiée. */
  @Get("batches/:id/file.xml")
  @Header("Content-Type", "application/xml; charset=utf-8")
  async file(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.queries.execute<ExportCollectionBatchFileQuery, CollectionBatchFile>(
      new ExportCollectionBatchFileQuery(id),
    );
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(file.fileName, "prelevement.xml")),
    );
    return file.xml;
  }

  @Get("batches/:id/audit.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async audit(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const audit = await this.queries.execute<ExportCollectionBatchAuditQuery, CollectionBatchAudit>(
      new ExportCollectionBatchAuditQuery(id),
    );
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(audit.fileName, "CONTROLE-prelevement.csv")),
    );
    return audit.csv;
  }

  /** Une commande à prélever (ou écartée) a été réglée par un autre chemin. */
  @Post("orders/:orderId/settle-otherwise")
  @HttpCode(HttpStatus.NO_CONTENT)
  async settleOtherwise(
    @StaffUserId() staffUserId: string,
    @Param("orderId") orderId: string,
    @Body(new ZodBody(settleOrderOtherwisePayloadSchema)) payload: SettleOrderOtherwisePayload,
  ): Promise<void> {
    await this.commands.execute<SettleOrderOtherwiseCommand, void>(
      new SettleOrderOtherwiseCommand(orderId, payload.note, staffUserId),
    );
  }
}
