import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CustomerDocumentStore } from "../../../../platform/storage/customer-document-store.js";
import { InvoiceNotFoundError } from "../../domain/errors/invoice-access-errors.js";
import { CompanyInvoicesReader } from "../../domain/ports/company-invoices.reader.js";
import { UnpaidAccessReader } from "../../domain/ports/unpaid-access.reader.js";
import { ensureInvoiceAccess } from "../../domain/services/invoice-access.js";
import { type InvoiceDocument, readInvoiceDocument } from "../invoice-document-support.js";
import { GetMyCompanyInvoiceDocumentQuery } from "./issued-invoice-queries.js";

/**
 * Le PDF d'une facture de « Mes factures » (E3b) : le mur de la liste
 * (détenteur ou facturation), puis la pièce doit être adressée à cette
 * société ou couvrir un de ses bons — sinon le même 404 qu'une pièce absente. Tant que le rendu n'est
 * pas fait, un 404 nommé.
 */
@QueryHandler(GetMyCompanyInvoiceDocumentQuery)
export class GetMyCompanyInvoiceDocumentHandler implements IQueryHandler<
  GetMyCompanyInvoiceDocumentQuery,
  InvoiceDocument
> {
  constructor(
    private readonly access: UnpaidAccessReader,
    private readonly invoices: CompanyInvoicesReader,
    private readonly store: CustomerDocumentStore,
  ) {}

  async execute(query: GetMyCompanyInvoiceDocumentQuery): Promise<InvoiceDocument> {
    ensureInvoiceAccess(
      await this.access.roleOf(query.actorUserId, query.companyId),
      query.companyId,
    );
    const invoice = await this.invoices.oneVisibleTo(query.invoiceId, query.companyId);
    if (invoice === null) {
      throw new InvoiceNotFoundError(query.invoiceId);
    }
    return readInvoiceDocument(this.store, invoice);
  }
}
