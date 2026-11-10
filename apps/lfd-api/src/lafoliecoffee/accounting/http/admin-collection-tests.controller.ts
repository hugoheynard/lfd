import {
  generateCollectionTestPayloadSchema,
  markCollectionTestRefundedPayloadSchema,
  type CollectionTestCreatedView,
  type CollectionTestDebtorsView,
  type CollectionTestsView,
  type GenerateCollectionTestPayload,
  type MarkCollectionTestRefundedPayload,
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
import { GenerateCollectionTestCommand } from "../application/commands/generate-collection-test.command.js";
import { RecordCollectionTestBankAccountDownloadCommand } from "../application/commands/record-collection-test-bank-account-download.command.js";
import { MarkCollectionTestRefundedCommand } from "../application/commands/mark-collection-test-refunded.command.js";
import {
  ExportCollectionTestBankAccountQuery,
  ExportCollectionTestFileQuery,
  ExportCollectionTestMandateQuery,
  GetCollectionTestDebtorsQuery,
  ListCollectionTestsQuery,
} from "../application/queries/collection-test-queries.js";
import type { CollectionTestBankAccountFile } from "../application/queries/export-collection-test-bank-account.handler.js";
import type { CollectionTestFile } from "../application/queries/export-collection-test-file.handler.js";
import type { MandateBankFile } from "../application/queries/export-mandate-bank-file.handler.js";

/**
 * **Le prélèvement d'essai** — Comptabilité › Prélèvement › « Prélèvement
 * d'essai » (plan `documentation/comptabilite/prelevement/plan-prelevement-d-essai.md`).
 *
 * Sous `collection_test`, la ressource la plus dangereuse du bloc : elle
 * fabrique un fichier de débit réel. Le fichier porte l'IBAN du débiteur en
 * clair : il se lit sous l'ÉCRITURE, bien que ce soit un `GET`.
 */
@Controller("admin/accounting/collection-tests")
@AdminSurface("collection_test")
export class AdminCollectionTestsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Nos établissements, prélevables à l'essai ou pourquoi pas. */
  @Get("debtors")
  debtors(): Promise<CollectionTestDebtorsView> {
    return this.queries.execute<GetCollectionTestDebtorsQuery, CollectionTestDebtorsView>(
      new GetCollectionTestDebtorsQuery(),
    );
  }

  /** La liste « Essais ». Sans IBAN. */
  @Get()
  list(): Promise<CollectionTestsView> {
    return this.queries.execute<ListCollectionTestsQuery, CollectionTestsView>(
      new ListCollectionTestsQuery(),
    );
  }

  /** Génère et garde le fichier ; 400/409 nommant le refus. */
  @Post()
  async generate(
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(generateCollectionTestPayloadSchema)) payload: GenerateCollectionTestPayload,
  ): Promise<CollectionTestCreatedView> {
    const testId = await this.commands.execute<GenerateCollectionTestCommand, string>(
      new GenerateCollectionTestCommand(
        payload.companyId,
        payload.amountCents,
        payload.requestedCollectionDay,
        payload.sequence,
        payload.remittance,
        staffUserId,
      ),
    );
    return { testId };
  }

  /**
   * Le mandat de l'établissement au format d'import de la banque (A à H, sans
   * en-tête). IBAN en clair : sous l'ÉCRITURE. Ne fige ni ne marque aucun export.
   */
  @Get("debtors/:companyId/mandate.csv")
  @RequirePermission("collection_test:write")
  @Header("Content-Type", "text/csv; charset=us-ascii")
  @Header("Cache-Control", "no-store")
  async mandate(
    @Param("companyId") companyId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.queries.execute<ExportCollectionTestMandateQuery, MandateBankFile>(
      new ExportCollectionTestMandateQuery(companyId),
    );
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(file.fileName, "mandat-banque.csv")),
    );
    return file.csv;
  }

  /**
   * Le RIB de l'établissement au format des comptes destinataires (en-tête,
   * une ligne, Latin-1 comme l'export réel). IBAN en clair : sous l'ÉCRITURE.
   * Ne fige ni ne marque aucun export. Calculé D'ABORD, journalisé ENSUITE :
   * un refus n'est pas un téléchargement.
   */
  @Get("debtors/:companyId/bank-account.csv")
  @RequirePermission("collection_test:write")
  @Header("Content-Type", "text/csv; charset=iso-8859-1")
  @Header("Cache-Control", "no-store")
  async bankAccount(
    @StaffUserId() staffUserId: string,
    @Param("companyId") companyId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.queries.execute<
      ExportCollectionTestBankAccountQuery,
      CollectionTestBankAccountFile
    >(new ExportCollectionTestBankAccountQuery(companyId));
    await this.commands.execute<RecordCollectionTestBankAccountDownloadCommand, void>(
      new RecordCollectionTestBankAccountDownloadCommand(
        file.company,
        file.legalEntity,
        staffUserId,
      ),
    );
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(file.fileName, "rib-banque.csv")),
    );
    return new StreamableFile(Buffer.from(file.csv, "latin1"));
  }

  /** Le fichier GARDÉ — mêmes octets à chaque téléchargement, empreinte vérifiée. */
  @Get(":id/file.xml")
  @RequirePermission("collection_test:write")
  @Header("Content-Type", "application/xml; charset=utf-8")
  @Header("Cache-Control", "no-store")
  async file(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.queries.execute<ExportCollectionTestFileQuery, CollectionTestFile>(
      new ExportCollectionTestFileQuery(id),
    );
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(file.fileName, "essai-prelevement.xml")),
    );
    return file.xml;
  }

  /** « Marqué remboursé » ; 409 s'il n'y a rien à rembourser ou si c'est déjà dit. */
  @Post(":id/refunded")
  @HttpCode(HttpStatus.NO_CONTENT)
  async refunded(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Body(new ZodBody(markCollectionTestRefundedPayloadSchema))
    payload: MarkCollectionTestRefundedPayload,
  ): Promise<void> {
    await this.commands.execute<MarkCollectionTestRefundedCommand, void>(
      new MarkCollectionTestRefundedCommand(id, payload.refundedOn, staffUserId),
    );
  }
}
