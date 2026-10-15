import {
  salesTermsDocuments,
  type OrderSalesTermsResponse,
  type SalesTermsDocument,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderSalesTermsRecordReader } from "../domain/ports/order-sales-terms-record.reader.js";

/**
 * Valeur stockée → texte. Le CHECK `orders_sales_terms_key_check` tient les
 * deux valeurs ; une autre rend `null` plutôt que d'afficher un texte faux.
 */
const DOCUMENT_OF_ROW_KEY: ReadonlyMap<string, SalesTermsDocument> = new Map([
  ["sales-terms", salesTermsDocuments[0]],
  ["sales-terms-pro", salesTermsDocuments[1]],
]);

/**
 * Relit les CGV figées sur une commande, et la date de dépôt du PDF qu'elle
 * porte. Le PDF vit dans `legal_document_files`, tenue par le contenu, même
 * bloc : la relation Prisma `salesTermsFile` suit la clé étrangère, sans SQL
 * écrit à la main.
 */
@Injectable()
export class PrismaOrderSalesTermsRecordReader extends OrderSalesTermsRecordReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async of(orderId: string): Promise<OrderSalesTermsResponse | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        placedByStaffId: true,
        salesTermsKey: true,
        salesTermsRevision: true,
        salesTermsFile: { select: { id: true, uploadedAt: true } },
      },
    });
    if (row === null) {
      return null;
    }
    const document = row.salesTermsKey === null ? null : DOCUMENT_OF_ROW_KEY.get(row.salesTermsKey);
    if (document === null || document === undefined) {
      return { salesTerms: null };
    }
    const file = row.salesTermsFile;
    return {
      salesTerms: {
        document,
        revision: row.salesTermsRevision,
        file: file === null ? null : { id: file.id, uploadedAt: file.uploadedAt.toISOString() },
        placedByStaff: row.placedByStaffId !== null,
      },
    };
  }
}
