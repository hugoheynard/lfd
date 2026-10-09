/**
 * Les lectures des **factures émises** (plan `facture-emise.md`). Des lectures pures : une pièce émise ne change plus.
 */

/** « Mes factures » — le demandeur décide du mur. */
export class ListMyCompanyInvoicesQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
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
