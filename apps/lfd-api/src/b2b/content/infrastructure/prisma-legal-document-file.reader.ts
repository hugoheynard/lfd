import type { SalesTermsDocument } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { LegalDocumentFile } from "../domain/entities/legal-document-file.js";
import { LegalDocumentFileReader } from "../domain/legal-document-file.reader.js";
import { SALES_TERMS_ROW_KEYS, toLegalDocumentFile } from "./legal-document-file.mapper.js";

/** Lit les PDF de référence — l'historique de l'écran et le téléchargement. */
@Injectable()
export class PrismaLegalDocumentFileReader extends LegalDocumentFileReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async history(document: SalesTermsDocument): Promise<readonly LegalDocumentFile[]> {
    const rows = await this.prisma.legalDocumentFile.findMany({
      where: { documentKey: SALES_TERMS_ROW_KEYS[document] },
      orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => toLegalDocumentFile(document, row));
  }

  async current(document: SalesTermsDocument): Promise<LegalDocumentFile | null> {
    const row = await this.prisma.legalDocumentFile.findFirst({
      where: { documentKey: SALES_TERMS_ROW_KEYS[document], supersededAt: null },
    });
    return row === null ? null : toLegalDocumentFile(document, row);
  }

  /** Sous la clé du texte : un id d'un autre texte rend `null`, pas l'autre PDF. */
  async byId(document: SalesTermsDocument, fileId: string): Promise<LegalDocumentFile | null> {
    const row = await this.prisma.legalDocumentFile.findFirst({
      where: { id: fileId, documentKey: SALES_TERMS_ROW_KEYS[document] },
    });
    return row === null ? null : toLegalDocumentFile(document, row);
  }
}
