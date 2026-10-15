import type { SalesTermsDocument } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { LegalDocumentFile } from "../domain/entities/legal-document-file.js";
import { LegalDocumentFileAlreadySupersededError } from "../domain/errors/legal-document-file-errors.js";
import { LegalDocumentFileRepository } from "../domain/legal-document-file.repository.js";
import { SALES_TERMS_ROW_KEYS, toLegalDocumentFile } from "./legal-document-file.mapper.js";

const UNIQUE_VIOLATION = "P2002";

/**
 * Écrit les PDF de référence — une ligne neuve par dépôt, et la seule
 * écriture admise sur une ancienne : poser son `superseded_at`.
 *
 * Deux dépôts simultanés : la pose conditionnée (`superseded_at IS NULL`)
 * n'aboutit que pour l'un, et l'index unique partiel « un seul en vigueur »
 * refuse le second même s'il n'avait rien à remplacer. Les deux cas rendent
 * le même refus, qui dit de rafraîchir.
 */
@Injectable()
export class PrismaLegalDocumentFileRepository extends LegalDocumentFileRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(document: SalesTermsDocument): Promise<LegalDocumentFile | null> {
    const row = await this.prisma.legalDocumentFile.findFirst({
      where: { documentKey: SALES_TERMS_ROW_KEYS[document], supersededAt: null },
    });
    return row === null ? null : toLegalDocumentFile(document, row);
  }

  async deposit(
    file: LegalDocumentFile,
    replaced: LegalDocumentFile | null,
    documentTitle: string,
  ): Promise<void> {
    const state = file.toState();
    try {
      await this.prisma.$transaction(async (tx) => {
        if (replaced !== null && replaced.supersededAt !== null) {
          const marked = await tx.legalDocumentFile.updateMany({
            where: { id: replaced.id, supersededAt: null },
            data: { supersededAt: replaced.supersededAt },
          });
          if (marked.count === 0) {
            throw new LegalDocumentFileAlreadySupersededError(documentTitle);
          }
        }
        await tx.legalDocumentFile.create({
          data: {
            id: state.id,
            documentKey: SALES_TERMS_ROW_KEYS[state.document],
            storageKey: state.storageKey,
            sha256: state.sha256,
            sizeBytes: state.sizeBytes,
            uploadedAt: state.uploadedAt,
            uploadedByStaffId: state.uploadedByStaffId,
          },
        });
      });
    } catch (error: unknown) {
      const code: unknown = error instanceof Error ? Reflect.get(error, "code") : null;
      if (code === UNIQUE_VIOLATION) {
        throw new LegalDocumentFileAlreadySupersededError(documentTitle);
      }
      throw error;
    }
  }
}
