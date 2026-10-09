import {
  confirmCollectionReturnImportFieldsSchema,
  recordCollectionReturnPayloadSchema,
  resolveCollectionReturnPayloadSchema,
  type BatchCollectionReturnsView,
  type CollectionReturnImportPreviewView,
  type CollectionReturnImportResultView,
  type CollectionReturnView,
  type CreatedIdResponse,
  type RecordCollectionReturnPayload,
  type ResolveCollectionReturnPayload,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { FileInterceptor } from "@nestjs/platform-express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ConfirmCollectionReturnImportCommand } from "../application/commands/confirm-collection-return-import.command.js";
import { RecordCollectionReturnCommand } from "../application/commands/record-collection-return.command.js";
import { RepresentCollectionReturnCommand } from "../application/commands/represent-collection-return.command.js";
import { SettleCollectionReturnCommand } from "../application/commands/settle-collection-return.command.js";
import { WriteOffCollectionReturnCommand } from "../application/commands/write-off-collection-return.command.js";
import {
  GetBatchCollectionReturnsQuery,
  GetPayerCollectionReturnsQuery,
  PreviewCollectionReturnImportQuery,
} from "../application/queries/collection-return-queries.js";
import { bankFileText, jsonField, type BankFilePart } from "./bank-return-file-upload.js";

/** Un relevé de retours pèse quelques dizaines de Ko ; au-delà, ce n'en est pas un. */
const BANK_FILE_HARD_LIMIT = 5 * 1024 * 1024;

/**
 * **Les retours bancaires** (plan
 * `documentation/comptabilite/prelevement/retours-bancaires.md`). L'action se déduit du verbe : `GET` lit (`b2b_accounting:read`), le
 * reste écrit (`b2b_accounting:write`, arbitrage A39) — y compris l'aperçu
 * d'un import, qui ne sert qu'à qui confirmera.
 */
@Controller("admin/accounting/collection-returns")
@AdminSurface("b2b_accounting")
export class AdminCollectionReturnsController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /** Les retours d'un lot, et les motifs pour en saisir un. */
  @Get("batches/:batchId")
  ofBatch(@Param("batchId") batchId: string): Promise<BatchCollectionReturnsView> {
    return this.queries.execute<GetBatchCollectionReturnsQuery, BatchCollectionReturnsView>(
      new GetBatchCollectionReturnsQuery(batchId),
    );
  }

  /** Les retours d'un payeur — la fiche client. */
  @Get("payers/:companyId")
  ofPayer(@Param("companyId") companyId: string): Promise<readonly CollectionReturnView[]> {
    return this.queries.execute<GetPayerCollectionReturnsQuery, readonly CollectionReturnView[]>(
      new GetPayerCollectionReturnsQuery(companyId),
    );
  }

  /** « Signaler un retour » sur une ligne déposée. */
  @Post("batches/:batchId/lines/:rank")
  async record(
    @StaffUserId() staffUserId: string,
    @Param("batchId") batchId: string,
    @Param("rank", ParseIntPipe) rank: number,
    @Body(new ZodBody(recordCollectionReturnPayloadSchema)) payload: RecordCollectionReturnPayload,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<RecordCollectionReturnCommand, string>(
      new RecordCollectionReturnCommand(
        batchId,
        rank,
        payload.kind,
        payload.reasonCode,
        payload.reasonLabel,
        payload.returnedOn,
        payload.feeCents,
        staffUserId,
      ),
    );
    return { id };
  }

  /** Re-présenter au prochain lot ; 409 en nommant pourquoi pas. */
  @Post(":id/represent")
  @HttpCode(HttpStatus.NO_CONTENT)
  async represent(@StaffUserId() staffUserId: string, @Param("id") id: string): Promise<void> {
    await this.commands.execute<RepresentCollectionReturnCommand, void>(
      new RepresentCollectionReturnCommand(id, staffUserId),
    );
  }

  /** Réglé autrement — lien de paiement, virement. */
  @Post(":id/settle-otherwise")
  @HttpCode(HttpStatus.NO_CONTENT)
  async settle(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Body(new ZodBody(resolveCollectionReturnPayloadSchema))
    payload: ResolveCollectionReturnPayload,
  ): Promise<void> {
    await this.commands.execute<SettleCollectionReturnCommand, void>(
      new SettleCollectionReturnCommand(id, payload.note, staffUserId),
    );
  }

  /** Passé en perte, avec un motif. */
  @Post(":id/write-off")
  @HttpCode(HttpStatus.NO_CONTENT)
  async writeOff(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Body(new ZodBody(resolveCollectionReturnPayloadSchema))
    payload: ResolveCollectionReturnPayload,
  ): Promise<void> {
    await this.commands.execute<WriteOffCollectionReturnCommand, void>(
      new WriteOffCollectionReturnCommand(id, payload.note, staffUserId),
    );
  }

  /** L'aperçu d'un `pain.002` ou d'un `camt.054` : rien n'est écrit. */
  @Post("import/preview")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: BANK_FILE_HARD_LIMIT } }))
  preview(
    @UploadedFile() file: BankFilePart | undefined,
  ): Promise<CollectionReturnImportPreviewView> {
    return this.queries.execute<
      PreviewCollectionReturnImportQuery,
      CollectionReturnImportPreviewView
    >(new PreviewCollectionReturnImportQuery(bankFileText(file)));
  }

  /** Enregistre les transactions retenues — le fichier de nouveau, relu. */
  @Post("import/confirm")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: BANK_FILE_HARD_LIMIT } }))
  async confirm(
    @StaffUserId() staffUserId: string,
    @UploadedFile() file: BankFilePart | undefined,
    @Body("endToEndIds") rawIds: unknown,
  ): Promise<CollectionReturnImportResultView> {
    const fields = new ZodBody(confirmCollectionReturnImportFieldsSchema).transform({
      endToEndIds: jsonField(rawIds),
    });
    const recordedIds = await this.commands.execute<
      ConfirmCollectionReturnImportCommand,
      readonly string[]
    >(
      new ConfirmCollectionReturnImportCommand(bankFileText(file), fields.endToEndIds, staffUserId),
    );
    return { recordedIds };
  }
}
