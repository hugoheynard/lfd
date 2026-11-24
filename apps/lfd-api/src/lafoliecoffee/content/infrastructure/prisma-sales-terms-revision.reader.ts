import type { SalesTermsDocument } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SalesTermsRevisionReader } from "../domain/sales-terms-revision.reader.js";
import { SALES_TERMS_ROW_KEYS } from "./legal-document-file.mapper.js";

/** La révision du texte, lue sur sa ligne de `platform_content` — celle que la passation fige. */
@Injectable()
export class PrismaSalesTermsRevisionReader extends SalesTermsRevisionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async revisionOf(document: SalesTermsDocument): Promise<number | null> {
    const row = await this.prisma.platformContent.findUnique({
      where: { key: SALES_TERMS_ROW_KEYS[document] },
      select: { revision: true },
    });
    return row?.revision ?? null;
  }
}
