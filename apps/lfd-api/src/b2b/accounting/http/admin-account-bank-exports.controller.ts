import {
  declareBankAccountKnownPayloadSchema,
  rejectBankAccountPayloadSchema,
  type AccountBankExportCreatedView,
  type AccountBankExportsView,
  type DeclareBankAccountKnownPayload,
  type RejectBankAccountPayload,
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
  StreamableFile,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AbandonAccountBankExportCommand } from "../application/commands/abandon-account-bank-export.command.js";
import { DeclareBankAccountKnownCommand } from "../application/commands/declare-bank-account-known.command.js";
import { ExportAccountsForBankCommand } from "../application/commands/export-accounts-for-bank.command.js";
import { MarkAccountBankExportImportedCommand } from "../application/commands/mark-account-bank-export-imported.command.js";
import { RejectBankAccountCommand } from "../application/commands/reject-bank-account.command.js";
import { ReportBankAccountKnownCommand } from "../application/commands/report-bank-account-known.command.js";
import { RecordAccountBankExportDownloadCommand } from "../application/commands/record-account-bank-export-download.command.js";
import {
  ExportAccountBankFileQuery,
  GetAccountBankExportsQuery,
} from "../application/queries/account-bank-export-queries.js";
import type { AccountBankFile } from "../application/queries/export-account-bank-file.handler.js";

/**
 * **Les comptes à la banque** — l'export du fichier des comptes destinataires
 * du portail de la banque, depuis la fiche de l'entité émettrice (doc
 * `documentation/comptabilite/prelevement/prerequis-export-ribs.md`).
 *
 * 🔴 Le fichier n'est fait que d'IBAN en clair : il se lit sous l'ÉCRITURE
 * comptable, bien que ce soit un `GET` ; il n'est ni rangé ni mis en cache
 * (`no-store`), part en pièce jointe, et chaque téléchargement est journalisé.
 * Les écritures (`POST`) sont sous l'écriture par la surface.
 */
@Controller("admin/accounting/legal-entities")
@AdminSurface("b2b_accounting")
export class AdminAccountBankExportsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** À exporter (nommés), en vol, connus, écartés, exports passés. Sans IBAN. */
  @Get(":id/account-exports")
  list(@Param("id") id: string): Promise<AccountBankExportsView> {
    return this.queries.execute<GetAccountBankExportsQuery, AccountBankExportsView>(
      new GetAccountBankExportsQuery(id),
    );
  }

  /** Fige un export des 200 premiers comptes à exporter ; 409 s'il n'y en a aucun. */
  @Post(":id/account-exports")
  async export(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
  ): Promise<AccountBankExportCreatedView> {
    const exportId = await this.commands.execute<ExportAccountsForBankCommand, string>(
      new ExportAccountsForBankCommand(id, staffUserId),
    );
    return { exportId };
  }

  /** Un compte connu de la banque sans notre fichier, et pourquoi ; 409 s'il est déjà connu ou en vol. */
  @Post(":id/account-exports/known-accounts")
  @HttpCode(HttpStatus.NO_CONTENT)
  async declareKnown(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Body(new ZodBody(declareBankAccountKnownPayloadSchema))
    payload: DeclareBankAccountKnownPayload,
  ): Promise<void> {
    await this.commands.execute<DeclareBankAccountKnownCommand, string>(
      new DeclareBankAccountKnownCommand(id, payload.bankAccountId, payload.reason, staffUserId),
    );
  }

  /**
   * Le fichier, recalculé ; 409 si un compte ne correspond plus ou si l'export
   * est abandonné. Calculé D'ABORD, journalisé ENSUITE : un refus n'est pas un
   * téléchargement, et un fichier qu'on n'a pas pu journaliser ne part pas.
   */
  @Get(":id/account-exports/:exportId/file.csv")
  @RequirePermission("b2b_accounting:write")
  @Header("Content-Type", "text/csv; charset=iso-8859-1")
  @Header("Cache-Control", "no-store")
  async file(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Param("exportId") exportId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.queries.execute<ExportAccountBankFileQuery, AccountBankFile>(
      new ExportAccountBankFileQuery(id, exportId),
    );
    await this.commands.execute<RecordAccountBankExportDownloadCommand, void>(
      new RecordAccountBankExportDownloadCommand(id, exportId, staffUserId),
    );
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(file.fileName, "comptes-banque.csv")),
    );
    // Des octets, pas une chaîne : Express réécrirait le jeu en `utf-8`. Le
    // contenu est de l'ASCII (`sepa()`), donc identique en Latin-1.
    return new StreamableFile(Buffer.from(file.csv, "latin1"));
  }

  /** La banque l'a importé ; 409 si l'export est déjà clos. */
  @Post(":id/account-exports/:exportId/imported")
  @HttpCode(HttpStatus.NO_CONTENT)
  async imported(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Param("exportId") exportId: string,
  ): Promise<void> {
    await this.commands.execute<MarkAccountBankExportImportedCommand, void>(
      new MarkAccountBankExportImportedCommand(id, exportId, staffUserId),
    );
  }

  /** Compte rendu CENET : la banque avait déjà ce compte ; 409 avant le dépôt ou déjà corrigé. */
  @Post(":id/account-exports/:exportId/accounts/:bankAccountId/reported-known")
  @HttpCode(HttpStatus.NO_CONTENT)
  async reportedKnown(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Param("exportId") exportId: string,
    @Param("bankAccountId") bankAccountId: string,
  ): Promise<void> {
    await this.commands.execute<ReportBankAccountKnownCommand, void>(
      new ReportBankAccountKnownCommand(id, exportId, bankAccountId, staffUserId),
    );
  }

  /** Compte rendu CENET : ce compte est en erreur, il redevient à exporter ; 409 avant le dépôt. */
  @Post(":id/account-exports/:exportId/accounts/:bankAccountId/rejected")
  @HttpCode(HttpStatus.NO_CONTENT)
  async rejected(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Param("exportId") exportId: string,
    @Param("bankAccountId") bankAccountId: string,
    @Body(new ZodBody(rejectBankAccountPayloadSchema)) payload: RejectBankAccountPayload,
  ): Promise<void> {
    await this.commands.execute<RejectBankAccountCommand, void>(
      new RejectBankAccountCommand(id, exportId, bankAccountId, payload.reason, staffUserId),
    );
  }

  /** La banque l'a rejeté : ses comptes redeviennent à exporter ; 409 s'il est déjà clos. */
  @Post(":id/account-exports/:exportId/abandoned")
  @HttpCode(HttpStatus.NO_CONTENT)
  async abandoned(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Param("exportId") exportId: string,
  ): Promise<void> {
    await this.commands.execute<AbandonAccountBankExportCommand, void>(
      new AbandonAccountBankExportCommand(id, exportId, staffUserId),
    );
  }
}
