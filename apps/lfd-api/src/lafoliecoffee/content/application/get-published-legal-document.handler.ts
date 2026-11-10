import {
  salesTermsDocuments,
  type LegalDocumentKey,
  type LegalDocumentPdfView,
  type PublishedLegalDocumentView,
  type SalesTermsDocument,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { LegalDocumentFile } from "../domain/entities/legal-document-file.js";
import { LegalDocumentFileReader } from "../domain/legal-document-file.reader.js";
import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { GetPublishedLegalDocumentQuery } from "./get-published-legal-document.query.js";

/**
 * Sert le document publié d'une mention, avec son PDF en vigueur (décision de
 * Hugo, 2026-10-15 : « l'API doit le dire »). Une requête en base pour le PDF,
 * aucune lecture du bucket : on annonce le fichier, on ne le sert pas ici.
 *
 * Une mention qui n'est pas un texte de CGV n'a jamais de PDF : `null` sans
 * interroger la table.
 */
@QueryHandler(GetPublishedLegalDocumentQuery)
export class GetPublishedLegalDocumentHandler implements IQueryHandler<
  GetPublishedLegalDocumentQuery,
  PublishedLegalDocumentView
> {
  constructor(
    private readonly content: PlatformContentRepository,
    private readonly files: LegalDocumentFileReader,
  ) {}

  async execute(query: GetPublishedLegalDocumentQuery): Promise<PublishedLegalDocumentView> {
    const view = await this.content.readLegalDocument(query.mention);
    return { ...view, pdf: await this.currentPdf(query.mention) };
  }

  private async currentPdf(mention: LegalDocumentKey): Promise<LegalDocumentPdfView | null> {
    if (!isSalesTermsDocument(mention)) {
      return null;
    }
    const file = await this.files.current(mention);
    return file === null ? null : toPdfView(file);
  }
}

function isSalesTermsDocument(mention: LegalDocumentKey): mention is SalesTermsDocument {
  return salesTermsDocuments.some((document) => document === mention);
}

function toPdfView(file: LegalDocumentFile): LegalDocumentPdfView {
  const state = file.toState();
  return {
    fileId: state.id,
    fileName: file.downloadFileName(),
    uploadedAt: state.uploadedAt.toISOString(),
    sizeBytes: state.sizeBytes,
  };
}
