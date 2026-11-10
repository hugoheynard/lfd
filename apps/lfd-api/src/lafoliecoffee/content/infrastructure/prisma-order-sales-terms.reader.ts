import type { SalesTermsDocument } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderSalesTermsReader,
  type SalesTermsInForce,
} from "../../orders/domain/ports/order-sales-terms.reader.js";
import { SALES_TERMS_ROW_KEYS } from "./legal-document-file.mapper.js";

/**
 * Les CGV en vigueur, telles que la passation les fige (plan
 * `legal/plan-cgv-par-audience.md`, C4′) — implémenté ICI, où vivent les
 * textes et leurs PDF, pour le port que la commande déclare.
 *
 * Le texte : la révision de sa ligne, `null` si personne ne l'a jamais écrit.
 * Le PDF : celui que l'index unique partiel tient pour « en vigueur ».
 */
@Injectable()
export class PrismaOrderSalesTermsReader extends OrderSalesTermsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async inForce(document: SalesTermsDocument): Promise<SalesTermsInForce> {
    const key = SALES_TERMS_ROW_KEYS[document];
    const [text, file] = await Promise.all([
      this.prisma.platformContent.findUnique({ where: { key }, select: { revision: true } }),
      this.prisma.legalDocumentFile.findFirst({
        where: { documentKey: key, supersededAt: null },
        select: { id: true },
      }),
    ]);
    return { revision: text?.revision ?? null, fileId: file?.id ?? null };
  }
}
