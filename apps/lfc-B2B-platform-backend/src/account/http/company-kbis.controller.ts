import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";

import { CurrentUser } from "../../infra/auth/current-user.decorator.js";
import type { Principal } from "../../infra/auth/principal.js";
import { UploadKbisCommand } from "../application/commands/upload-kbis.command.js";
import {
  DownloadKbisQuery,
  type KbisDownload,
} from "../application/queries/download-kbis.query.js";
import { InvalidKbisFileError } from "../domain/errors/account-errors.js";

/** Backstop DoS du multipart, très au-dessus de la limite métier (le domaine tranche à 10 Mo). */
const KBIS_UPLOAD_HARD_LIMIT = 20 * 1024 * 1024;

/**
 * Le peu qu'on lit du fichier Multer. Typé localement plutôt que via le namespace
 * global `Express.Multer` (dont l'augmentation @types/multer se charge mal) : on
 * n'utilise que le nom et les octets, et le domaine valide le reste.
 */
interface UploadedFilePart {
  readonly originalname: string;
  readonly buffer: Buffer;
}

/**
 * KBIS d'une entreprise — l'extrait demandé pour la validation.
 *
 * Dépôt réservé au **gestionnaire** (`ensureCompanyAdmin`) ; téléchargement
 * ouvert à tout **membre** (`ensureCompanyMember`). Le mur vit dans les handlers ;
 * le contrôleur ne fait que le transport (multipart en entrée, flux en sortie).
 */
@Controller("companies")
export class CompanyKbisController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * Dépose (ou remplace) le KBIS. Le fichier arrive en **multipart** (`file`),
   * gardé en mémoire par Multer. Aucune validation ici : c'est le domaine
   * (`KbisFile`) qui vérifie le PDF par ses octets et la taille. La limite Multer
   * n'est qu'un garde-fou DoS, très au-dessus de la limite métier.
   */
  @Put(":companyId/kbis")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: KBIS_UPLOAD_HARD_LIMIT } }))
  async upload(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @UploadedFile() file: UploadedFilePart | undefined,
  ): Promise<void> {
    if (file === undefined) {
      throw new InvalidKbisFileError("aucun fichier reçu.");
    }
    await this.commands.execute<UploadKbisCommand, void>(
      new UploadKbisCommand(user.userId, companyId, file.originalname, file.buffer),
    );
  }

  /**
   * Sert le KBIS pour le voir/télécharger. `Content-Disposition: attachment` avec
   * le nom **assaini** (jamais le nom brut du client dans un en-tête) ; le front
   * en fait de toute façon un blob pour l'ouvrir ou l'enregistrer.
   */
  @Get(":companyId/kbis")
  async download(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const kbis = await this.queries.execute<DownloadKbisQuery, KbisDownload>(
      new DownloadKbisQuery(user.userId, companyId),
    );
    res.setHeader("Content-Type", kbis.contentType);
    res.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(kbis.fileName, "kbis.pdf")),
    );
    return new StreamableFile(kbis.bytes);
  }
}
