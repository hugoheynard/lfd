import {
  exportMandatesForBankPayloadSchema,
  type ExportMandatesForBankPayload,
  type MandateBankExportCreatedView,
  type MandateBankExportsView,
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
  Res,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ExportMandatesForBankCommand } from "../application/commands/export-mandates-for-bank.command.js";
import { MarkMandateBankExportImportedCommand } from "../application/commands/mark-mandate-bank-export-imported.command.js";
import type { MandateBankFile } from "../application/queries/export-mandate-bank-file.handler.js";
import {
  ExportMandateBankFileQuery,
  GetMandateBankExportsQuery,
} from "../application/queries/mandate-bank-export-queries.js";

/**
 * **Les mandats à la banque** — l'export du fichier d'import des mandats du
 * portail de la banque, depuis la fiche de l'entité émettrice (plan
 * `documentation/comptabilite/mandat/export-des-mandats-pour-la-banque.md`).
 *
 * 🔴 Le fichier porte les IBAN en clair : il se lit sous l'ÉCRITURE comptable,
 * bien que ce soit un `GET` — le verbe ment sur ce qu'il fait sortir. Il n'est
 * ni rangé ni mis en cache (`no-store`), et part en pièce jointe.
 */
@Controller("admin/accounting/legal-entities")
@AdminSurface("b2b_accounting")
export class AdminMandateBankExportsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** À exporter, déjà importés, écartés nommés, exports passés. Sans IBAN. */
  @Get(":id/mandate-exports")
  list(@Param("id") id: string): Promise<MandateBankExportsView> {
    return this.queries.execute<GetMandateBankExportsQuery, MandateBankExportsView>(
      new GetMandateBankExportsQuery(id),
    );
  }

  /** Fige un export ; 409 s'il n'y a rien à exporter. */
  @Post(":id/mandate-exports")
  async export(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Body(new ZodBody(exportMandatesForBankPayloadSchema)) payload: ExportMandatesForBankPayload,
  ): Promise<MandateBankExportCreatedView> {
    const exportId = await this.commands.execute<ExportMandatesForBankCommand, string>(
      new ExportMandatesForBankCommand(id, payload.all, staffUserId),
    );
    return { exportId };
  }

  /** Le fichier, recalculé ; 409 si un compte ne correspond plus. */
  @Get(":id/mandate-exports/:exportId/file.csv")
  @RequirePermission("b2b_accounting:write")
  @Header("Content-Type", "text/csv; charset=us-ascii")
  @Header("Cache-Control", "no-store")
  async file(
    @Param("id") id: string,
    @Param("exportId") exportId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.queries.execute<ExportMandateBankFileQuery, MandateBankFile>(
      new ExportMandateBankFileQuery(id, exportId),
    );
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(file.fileName, "mandats-banque.csv")),
    );
    return file.csv;
  }

  /** La banque l'a importé ; 409 si c'est déjà dit. */
  @Post(":id/mandate-exports/:exportId/imported")
  @HttpCode(HttpStatus.NO_CONTENT)
  async imported(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Param("exportId") exportId: string,
  ): Promise<void> {
    await this.commands.execute<MarkMandateBankExportImportedCommand, void>(
      new MarkMandateBankExportImportedCommand(id, exportId, staffUserId),
    );
  }
}
