/**
 * Les factures au virement non réglées (V8, C7) — d'une entité, d'un payeur,
 * ou toutes ; `overdueOnly` : seulement celles dont l'échéance est passée.
 */
export class ListUnpaidTransferInvoicesQuery {
  constructor(
    readonly legalEntityId: string | null,
    readonly payerCompanyId: string | null,
    readonly overdueOnly: boolean,
  ) {}
}
