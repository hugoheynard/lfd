import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CustomerDocumentStore } from "../../../../platform/storage/customer-document-store.js";
import { CompanyInvoicesReader } from "../../domain/ports/company-invoices.reader.js";
import { CompanyLabelReader } from "../../domain/ports/company-label.reader.js";
import { StoredZipWriter } from "../../domain/ports/stored-zip-writer.js";
import { UnpaidAccessReader } from "../../domain/ports/unpaid-access.reader.js";
import { ensureInvoiceAccess } from "../../domain/services/invoice-access.js";
import { archiveFileName, archivePieces } from "../../domain/services/invoice-archive.js";
import {
  archiveCandidateOf,
  archiveOf,
  type InvoiceArchive,
  readArchiveEntries,
} from "../invoice-archive-support.js";
import { ExportMyCompanyInvoicesArchiveQuery } from "./issued-invoice-queries.js";

/**
 * Le zip de « Mes factures » (plan `plan-page-mes-factures.md`, P2, §7.5) :
 * le mur de la liste (détenteur ou facturation), UNE lecture des pièces
 * visibles — filtrée par les ids d'une sélection —, puis chaque PDF relu et
 * vérifié AVANT que le contrôleur n'écrive un en-tête. Entier, ou un refus
 * qui nomme les pièces en cause.
 */
@QueryHandler(ExportMyCompanyInvoicesArchiveQuery)
export class ExportMyCompanyInvoicesArchiveHandler implements IQueryHandler<
  ExportMyCompanyInvoicesArchiveQuery,
  InvoiceArchive
> {
  constructor(
    private readonly access: UnpaidAccessReader,
    private readonly invoices: CompanyInvoicesReader,
    private readonly labels: CompanyLabelReader,
    private readonly store: CustomerDocumentStore,
    private readonly zip: StoredZipWriter,
  ) {}

  async execute(query: ExportMyCompanyInvoicesArchiveQuery): Promise<InvoiceArchive> {
    ensureInvoiceAccess(
      await this.access.roleOf(query.actorUserId, query.companyId),
      query.companyId,
    );
    const { selection } = query;
    const visible =
      selection.by === "ids"
        ? await this.invoices.visibleTo(query.companyId, selection.ids)
        : await this.invoices.visibleTo(query.companyId);
    const pieces = archivePieces(visible.map(archiveCandidateOf), selection);
    const entries = await readArchiveEntries(this.store, pieces);
    const label = (await this.labels.labelOf(query.companyId)) ?? "";
    return archiveOf(archiveFileName(label, selection), this.zip.write(entries));
  }
}
