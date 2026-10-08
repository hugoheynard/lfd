/**
 * Les lectures des **factures émises** (plan `plan-emission-de-la-facture.md`,
 * E6). Des lectures pures : une pièce émise ne change plus.
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
