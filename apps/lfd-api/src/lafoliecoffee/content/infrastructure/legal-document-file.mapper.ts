import type { SalesTermsDocument } from "@lfd/contracts";

import { LegalDocumentFile } from "../domain/entities/legal-document-file.js";

/**
 * La clé de ligne de chaque texte — la MÊME que dans `platform_content`, et
 * tenue par le CHECK de `legal_document_files`. Une table explicite, pour la
 * raison que donne `LEGAL_DOCUMENT_KEYS` : un renommage de vocabulaire ne doit
 * pas devenir une migration de données silencieuse.
 */
export const SALES_TERMS_ROW_KEYS: Readonly<Record<SalesTermsDocument, string>> = {
  salesTerms: "sales-terms",
  salesTermsPro: "sales-terms-pro",
};

/** Une ligne telle que l'adaptateur la lit — aucun type Prisma ne sort d'ici. */
export interface LegalDocumentFileRow {
  readonly id: string;
  readonly documentKey: string;
  readonly storageKey: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly uploadedAt: Date;
  readonly uploadedByStaffId: string;
  readonly supersededAt: Date | null;
}

/** Ligne → agrégat. Le texte est celui demandé : la ligne a été lue sous sa clé. */
export function toLegalDocumentFile(
  document: SalesTermsDocument,
  row: LegalDocumentFileRow,
): LegalDocumentFile {
  return LegalDocumentFile.reconstitute({
    id: row.id,
    document,
    storageKey: row.storageKey,
    sha256: row.sha256,
    sizeBytes: row.sizeBytes,
    uploadedAt: row.uploadedAt,
    uploadedByStaffId: row.uploadedByStaffId,
    supersededAt: row.supersededAt,
  });
}
