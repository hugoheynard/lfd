import type { LegalDocumentView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { GetLegalDocumentQuery } from "./get-legal-document.query.js";

/**
 * Sert le document d'une mention. Lecture pure, et qui aboutit toujours : sans
 * ligne en base, le port rend le document de départ en révision zéro.
 */
@QueryHandler(GetLegalDocumentQuery)
export class GetLegalDocumentHandler implements IQueryHandler<
  GetLegalDocumentQuery,
  LegalDocumentView
> {
  constructor(private readonly content: PlatformContentRepository) {}

  execute(query: GetLegalDocumentQuery): Promise<LegalDocumentView> {
    return this.content.readLegalDocument(query.mention);
  }
}
