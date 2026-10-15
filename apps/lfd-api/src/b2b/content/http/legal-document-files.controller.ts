import type { SalesTermsDocument } from "@lfd/contracts";
import { Controller, Get, Param, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";

import { Public } from "../../../platform/auth/public.decorator.js";
import {
  GetLegalDocumentFileQuery,
  type LegalDocumentFileDownload,
} from "../application/get-legal-document-file.query.js";
import { legalDocumentFileResponse } from "./legal-document-file-response.js";
import { SalesTermsDocumentParam } from "./sales-terms-document.pipe.js";

/**
 * Téléchargement **public** des PDF de référence des CGV (plan
 * `legal/plan-cgv-par-audience.md`, C3, et C2′ remplacé le 2026-10-15) : les
 * CGV particuliers comme professionnelles sont des conditions publiées — une
 * landing pro doit pouvoir donner les siennes sans connexion.
 *
 * Même throttle que la lecture publique des mentions : surface anonyme.
 */
@Controller("content/legal")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class LegalDocumentFilesController {
  constructor(private readonly queries: QueryBus) {}

  /** Le PDF en vigueur. **404** tant qu'aucun n'est déposé : la page garde son texte. */
  @Get(":mention/pdf")
  async current(
    @Param("mention", SalesTermsDocumentParam) document: SalesTermsDocument,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const download = await this.queries.execute<
      GetLegalDocumentFileQuery,
      LegalDocumentFileDownload
    >(new GetLegalDocumentFileQuery(document, null));
    return legalDocumentFileResponse(download, response);
  }

  /**
   * Un dépôt précis, remplacé compris : le PDF qu'une commande porte (C4).
   * Chaque dépôt a été, à son heure, le PDF public en vigueur.
   */
  @Get(":mention/files/:fileId")
  async byId(
    @Param("mention", SalesTermsDocumentParam) document: SalesTermsDocument,
    @Param("fileId") fileId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const download = await this.queries.execute<
      GetLegalDocumentFileQuery,
      LegalDocumentFileDownload
    >(new GetLegalDocumentFileQuery(document, fileId));
    return legalDocumentFileResponse(download, response);
  }
}
