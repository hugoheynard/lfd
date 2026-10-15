import { LEGAL_DOCUMENT_TITLES } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CustomerDocumentStore } from "../../../platform/storage/customer-document-store.js";
import {
  NoLegalDocumentFileError,
  UnknownLegalDocumentFileError,
} from "../domain/errors/legal-document-file-errors.js";
import type { LegalDocumentFile } from "../domain/entities/legal-document-file.js";
import { LegalDocumentFileReader } from "../domain/legal-document-file.reader.js";
import {
  GetLegalDocumentFileQuery,
  type LegalDocumentFileDownload,
} from "./get-legal-document-file.query.js";

/**
 * Sert un PDF de référence. Tous ses dépôts sont publics : chacun a été, à
 * son heure, le PDF en vigueur que la boutique servait à tous — les CGV ne
 * sont pas un secret (Hugo, 2026-10-15). C'est ce qui permet au détail d'une
 * commande de pointer le PDF qu'elle porte, même remplacé depuis.
 *
 * Un objet absent du bucket alors que la ligne existe est une PANNE
 * (`read` lève) : la ligne a promis le fichier.
 */
@QueryHandler(GetLegalDocumentFileQuery)
export class GetLegalDocumentFileHandler implements IQueryHandler<
  GetLegalDocumentFileQuery,
  LegalDocumentFileDownload
> {
  constructor(
    private readonly files: LegalDocumentFileReader,
    private readonly store: CustomerDocumentStore,
  ) {}

  async execute(query: GetLegalDocumentFileQuery): Promise<LegalDocumentFileDownload> {
    const file = await this.find(query);
    return { bytes: await this.store.read(file.storageKey), fileName: file.downloadFileName() };
  }

  private async find(query: GetLegalDocumentFileQuery): Promise<LegalDocumentFile> {
    const title = LEGAL_DOCUMENT_TITLES[query.document].fr;
    if (query.fileId === null) {
      const current = await this.files.current(query.document);
      if (current === null) {
        throw new NoLegalDocumentFileError(title);
      }
      return current;
    }
    const file = await this.files.byId(query.document, query.fileId);
    if (file === null) {
      throw new UnknownLegalDocumentFileError(query.fileId, title);
    }
    return file;
  }
}
