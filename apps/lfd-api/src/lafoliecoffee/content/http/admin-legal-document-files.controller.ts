import type {
  LegalDocumentFileDeposited,
  LegalDocumentFileHistoryView,
  SalesTermsDocument,
} from "@lfd/contracts";
import { Controller, Get, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { FileInterceptor } from "@nestjs/platform-express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { DepositLegalDocumentFileCommand } from "../application/deposit-legal-document-file.command.js";
import { ListLegalDocumentFilesQuery } from "../application/list-legal-document-files.query.js";
import { InvalidLegalPdfError } from "../domain/errors/legal-document-file-errors.js";
import { SalesTermsDocumentParam } from "./sales-terms-document.pipe.js";

/**
 * Backstop DoS du multipart : le domaine tranche à 10 Mo (`LegalPdf`), cette
 * borne-ci ne protège que le processus d'un corps qu'on n'a aucune raison de
 * lire. Un octet de plus que le domaine, pour que ce soit LUI qui refuse, avec
 * son message.
 */
const PDF_UPLOAD_HARD_LIMIT = 10 * 1024 * 1024 + 1;

/** Le peu qu'on lit du fichier Multer : ses octets. Le domaine juge le reste. */
interface UploadedFilePart {
  readonly buffer: Buffer;
}

/**
 * Le **PDF de référence** des CGV au back-office (Réglages › Légal › CGV) —
 * déposer, lister l'historique (plan `legal/plan-cgv-par-audience.md`, C3, C5).
 * Sous `lfc_legal` : déposer est une écriture, la garde de surface le tient.
 *
 * Le téléchargement n'est pas ici : il est public
 * ({@link LegalDocumentFilesController}), et l'écran s'en sert aussi.
 */
@Controller("admin/content/legal")
@AdminSurface("lfc_legal")
export class AdminLegalDocumentFilesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get(":mention/files")
  history(
    @Param("mention", SalesTermsDocumentParam) document: SalesTermsDocument,
  ): Promise<LegalDocumentFileHistoryView> {
    return this.queries.execute<ListLegalDocumentFilesQuery, LegalDocumentFileHistoryView>(
      new ListLegalDocumentFilesQuery(document),
    );
  }

  /**
   * Dépose un PDF, qui devient celui en vigueur. Multipart `file`. Rend
   * l'identifiant du dépôt ; l'écran relit l'historique.
   */
  @Post(":mention/files")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: PDF_UPLOAD_HARD_LIMIT } }))
  async deposit(
    @Param("mention", SalesTermsDocumentParam) document: SalesTermsDocument,
    @UploadedFile() file: UploadedFilePart | undefined,
    @StaffUserId() staffUserId: string,
  ): Promise<LegalDocumentFileDeposited> {
    if (file === undefined) {
      throw new InvalidLegalPdfError("aucun fichier n'a été reçu.");
    }
    const id = await this.commands.execute<DepositLegalDocumentFileCommand, string>(
      new DepositLegalDocumentFileCommand(document, file.buffer, staffUserId),
    );
    return { id };
  }
}
