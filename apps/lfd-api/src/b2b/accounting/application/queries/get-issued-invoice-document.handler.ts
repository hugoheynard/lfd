import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CustomerDocumentStore } from "../../../../platform/storage/customer-document-store.js";
import { InvoiceNotFoundError } from "../../domain/errors/invoice-access-errors.js";
import { InvoiceReader } from "../../domain/ports/invoice.reader.js";
import { type InvoiceDocument, readInvoiceDocument } from "../invoice-document-support.js";
import { GetIssuedInvoiceDocumentQuery } from "./issued-invoice-queries.js";

/**
 * Le PDF/A-3 rangé d'une pièce, dans la comptabilité du back-office (E3b) :
 * 404 si la pièce n'existe pas, 404 NOMMÉ tant que son rendu n'est pas fait.
 * Une lecture : elle ne rend rien, elle relit ce que le rendu a rangé.
 */
@QueryHandler(GetIssuedInvoiceDocumentQuery)
export class GetIssuedInvoiceDocumentHandler implements IQueryHandler<
  GetIssuedInvoiceDocumentQuery,
  InvoiceDocument
> {
  constructor(
    private readonly invoices: InvoiceReader,
    private readonly store: CustomerDocumentStore,
  ) {}

  async execute(query: GetIssuedInvoiceDocumentQuery): Promise<InvoiceDocument> {
    const invoice = await this.invoices.byId(query.invoiceId);
    if (invoice === null) {
      throw new InvoiceNotFoundError(query.invoiceId);
    }
    return readInvoiceDocument(this.store, invoice);
  }
}
