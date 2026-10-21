import type { ArchiveSelection } from "../../domain/services/invoice-archive.js";
import { NO_LEDGER_FILTER, type LedgerFilter } from "../../domain/services/my-invoices-ledger.js";

/**
 * Les lectures des **factures émises** (plan `facture-emise.md`). Des lectures pures : une pièce émise ne change plus.
 */

/**
 * « Mes factures » — le demandeur décide du mur ; le filtre ne choisit que
 * les lignes, jamais le total dû (plan `plan-page-mes-factures.md` §7.3).
 */
export class ListMyCompanyInvoicesQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly filter: LedgerFilter = NO_LEDGER_FILTER,
  ) {}
}

/** Une facture de « Mes factures », adressée à cette société. */
export class GetMyCompanyInvoiceQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly invoiceId: string,
  ) {}
}

/** Les factures et avoirs d'une société, depuis la fiche client du back-office. */
export class ListCompanyInvoicesQuery {
  constructor(readonly companyId: string) {}
}

/** Une pièce, depuis la comptabilité du back-office. */
export class GetIssuedInvoiceQuery {
  constructor(readonly invoiceId: string) {}
}

/** Le PDF rangé d'une facture de « Mes factures », adressée à cette société (E3b). */
export class GetMyCompanyInvoiceDocumentQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly invoiceId: string,
  ) {}
}

/** Le PDF rangé d'une pièce, depuis la comptabilité du back-office (E3b). */
export class GetIssuedInvoiceDocumentQuery {
  constructor(readonly invoiceId: string) {}
}

/**
 * Le zip de « Mes factures » (P2) : les PDF rangés des pièces filtrées, ou
 * d'une sélection — le mur de la liste, et un zip entier ou un refus.
 */
export class ExportMyCompanyInvoicesArchiveQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly selection: ArchiveSelection,
  ) {}
}
