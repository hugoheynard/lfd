import type { LegalDocumentFileHistoryView, LegalDocumentFileView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  StaffAuthorDirectory,
  type StaffAuthors,
} from "../../../staff/directory/domain/staff-author-directory.js";
import type { LegalDocumentFile } from "../domain/entities/legal-document-file.js";
import { LegalDocumentFileReader } from "../domain/legal-document-file.reader.js";
import { ListLegalDocumentFilesQuery } from "./list-legal-document-files.query.js";

/**
 * L'historique des dépôts, auteurs nommés par l'annuaire — une lecture pour
 * toute la liste. Une fiche inconnue rend `null`, jamais un nom inventé.
 */
@QueryHandler(ListLegalDocumentFilesQuery)
export class ListLegalDocumentFilesHandler implements IQueryHandler<
  ListLegalDocumentFilesQuery,
  LegalDocumentFileHistoryView
> {
  constructor(
    private readonly files: LegalDocumentFileReader,
    private readonly authors: StaffAuthorDirectory,
  ) {}

  async execute(query: ListLegalDocumentFilesQuery): Promise<LegalDocumentFileHistoryView> {
    const files = await this.files.history(query.document);
    const authors = await this.authors.identify(
      files.map((file) => file.toState().uploadedByStaffId),
    );
    return { document: query.document, files: files.map((file) => toView(file, authors)) };
  }
}

function toView(file: LegalDocumentFile, authors: StaffAuthors): LegalDocumentFileView {
  const state = file.toState();
  return {
    id: state.id,
    document: state.document,
    sizeBytes: state.sizeBytes,
    sha256: state.sha256,
    uploadedAt: state.uploadedAt.toISOString(),
    uploadedByName: authors.nameOf(state.uploadedByStaffId),
    supersededAt: state.supersededAt === null ? null : state.supersededAt.toISOString(),
  };
}
