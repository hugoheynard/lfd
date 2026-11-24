import type { SalesTermsDocument } from "@lfd/contracts";

import { LegalDocumentFile } from "../../domain/entities/legal-document-file.js";
import { LegalDocumentFileAlreadySupersededError } from "../../domain/errors/legal-document-file-errors.js";
import { LegalDocumentFileRepository } from "../../domain/legal-document-file.repository.js";
import { SalesTermsRevisionReader } from "../../domain/sales-terms-revision.reader.js";

/**
 * Les dépôts en mémoire, qui jouent les DEUX ports (écriture et lecture) sur
 * le même état — et qui tiennent, comme la base, « un seul en vigueur ».
 */
export class MemoryFiles extends LegalDocumentFileRepository {
  readonly rows: LegalDocumentFile[] = [];
  /** Simule un dépôt concurrent qui a remplacé le PDF entre lecture et écriture. */
  raceLost = false;

  current(document: SalesTermsDocument): Promise<LegalDocumentFile | null> {
    const found = this.rows.find((row) => row.document === document && row.supersededAt === null);
    return Promise.resolve(found === undefined ? null : rehydrate(found));
  }

  deposit(
    file: LegalDocumentFile,
    replaced: LegalDocumentFile | null,
    documentTitle: string,
  ): Promise<void> {
    if (this.raceLost) {
      return Promise.reject(new LegalDocumentFileAlreadySupersededError(documentTitle));
    }
    if (replaced !== null) {
      const index = this.rows.findIndex((row) => row.id === replaced.id);
      this.rows[index] = rehydrate(replaced);
    }
    this.rows.push(rehydrate(file));
    return Promise.resolve();
  }
}

/** Une copie : ce que le port rend n'est pas l'objet que la mémoire garde. */
export function rehydrate(file: LegalDocumentFile): LegalDocumentFile {
  return LegalDocumentFile.reconstitute(file.toState());
}

/** La révision de chaque texte, réglée par le test ; absente = jamais écrit. */
export class FixedSalesTermsRevisions extends SalesTermsRevisionReader {
  readonly revisions = new Map<SalesTermsDocument, number>();

  revisionOf(document: SalesTermsDocument): Promise<number | null> {
    return Promise.resolve(this.revisions.get(document) ?? null);
  }
}
