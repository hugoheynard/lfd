import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { Invoice } from "../domain/entities/invoice.js";
import { InvoiceDocumentAlreadyAttachedError } from "../domain/errors/invoice-errors.js";
import { InvoiceRepository } from "../domain/ports/invoice.repository.js";
import { toInvoiceCreate } from "./invoice.mapper.js";

/**
 * Adaptateur d'écriture des factures émises : les deux gestes du port.
 *
 * 🔴 La base garde l'immuabilité quoi qu'écrive ce fichier : le déclencheur
 * `invoice_immutable` (migration `20261008190000_la_facture_emise`) refuse
 * tout `DELETE` et toute modification autre que la pose du document, une
 * fois ; `invoice_order_invoiced_once` refuse un bon déjà facturé.
 */
@Injectable()
export class PrismaInvoiceRepository extends InvoiceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async insert(invoice: Invoice): Promise<void> {
    await this.prisma.invoice.create({ data: toInvoiceCreate(invoice) });
  }

  /**
   * Conditionné en base sur `document_key IS NULL` : deux rendus concurrents
   * de la même facture, un seul écrit — l'autre est refusé, pas écrasé.
   */
  async attachDocument(invoice: Invoice): Promise<void> {
    const state = invoice.toState();
    if (state.documentKey === null || state.documentSha256 === null) {
      return;
    }
    const written = await this.prisma.invoice.updateMany({
      where: { id: state.id, documentKey: null },
      data: { documentKey: state.documentKey, documentSha256: state.documentSha256 },
    });
    if (written.count === 0) {
      throw new InvoiceDocumentAlreadyAttachedError(state.number);
    }
  }
}
