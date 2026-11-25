import type { FunctionSheetUploaded } from "@lfd/contracts";
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ArchiveFunctionSheetCommand } from "../application/commands/archive-function-sheet.command.js";
import { DepositFunctionSheetCommand } from "../application/commands/deposit-function-sheet.command.js";
import { ReplaceFunctionSheetCommand } from "../application/commands/replace-function-sheet.command.js";
import type { FunctionSheetFile } from "../application/queries/get-function-sheet-file.handler.js";
import { GetFunctionSheetFileQuery } from "../application/queries/get-function-sheet-file.query.js";
import { functionSheetUpload, type UploadedFunctionSheet } from "./function-sheet-http.js";

/** Le nom servi quand celui du dépôt ne survit pas à l'assainissement. */
const FALLBACK_DOWNLOAD_NAME = "fiche-de-fonction.pdf";

/**
 * **Les fiches de fonction d'un événement** — déposer, remplacer, télécharger, retirer
 * (`documentation/evenements/plan-evenements.md`, E2). La liste est servie
 * avec le détail de l'événement.
 */
@Controller("admin/events/:eventId/function-sheets")
@AdminSurface("events")
export class AdminEventFunctionSheetsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Déposer UNE fiche en PDF — une clé d'intention par dépôt. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(functionSheetUpload())
  async deposit(
    @Param("eventId") eventId: string,
    @UploadedFile() file: UploadedFunctionSheet | undefined,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<FunctionSheetUploaded> {
    const id = await this.commands.execute<DepositFunctionSheetCommand, string>(
      new DepositFunctionSheetCommand(
        eventId,
        file?.buffer ?? null,
        file?.originalname ?? "",
        file?.mimetype ?? "",
        staffUserId,
        intentKey,
      ),
    );
    return { id };
  }

  /**
   * Remplacer une fiche par une version plus récente : l'ancienne s'archive,
   * la nouvelle prend son rang. Une clé d'intention par remplacement.
   */
  @Post(":sheetId/replacement")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(functionSheetUpload())
  async replace(
    @Param("eventId") eventId: string,
    @Param("sheetId") sheetId: string,
    @UploadedFile() file: UploadedFunctionSheet | undefined,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<FunctionSheetUploaded> {
    const id = await this.commands.execute<ReplaceFunctionSheetCommand, string>(
      new ReplaceFunctionSheetCommand(
        eventId,
        sheetId,
        file?.buffer ?? null,
        file?.originalname ?? "",
        file?.mimetype ?? "",
        staffUserId,
        intentKey,
      ),
    );
    return { id };
  }

  /**
   * Sert la fiche en **pièce jointe** : c'est un fichier téléversé, et un
   * contenu téléversé ne se rend jamais `inline` dans notre origine.
   */
  @Get(":sheetId")
  async download(
    @Param("eventId") eventId: string,
    @Param("sheetId") sheetId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const sheet = await this.queries.execute<GetFunctionSheetFileQuery, FunctionSheetFile>(
      new GetFunctionSheetFileQuery(eventId, sheetId),
    );
    response.setHeader("Content-Type", sheet.contentType);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(sheet.fileName, FALLBACK_DOWNLOAD_NAME)),
    );
    return new StreamableFile(sheet.bytes);
  }

  @Delete(":sheetId")
  @Idempotent(
    "par nature : retirer une fiche déjà retirée ne change rien ; rejouée, la requête rend le même état",
  )
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @Param("eventId") eventId: string,
    @Param("sheetId") sheetId: string,
  ): Promise<void> {
    await this.commands.execute<ArchiveFunctionSheetCommand, void>(
      new ArchiveFunctionSheetCommand(eventId, sheetId),
    );
  }
}
