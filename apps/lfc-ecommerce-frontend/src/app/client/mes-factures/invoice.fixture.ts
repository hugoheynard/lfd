import type { IssuedInvoiceView, MyIssuedInvoiceView } from '@lfd/contracts';

/**
 * Des pièces de « Mes factures » pour les specs (E6). Les dates ne sont
 * qu'affichées : aucune n'est comparée à l'horloge.
 */
export const SEPTEMBER: MyIssuedInvoiceView = {
  invoiceId: 'inv_1',
  number: 'FA-2026-000007',
  kind: 'invoice',
  correctedInvoiceNumber: null,
  issuedOn: '2026-09-30',
  dueOn: '2026-10-15',
  period: '2026-09',
  periodClosesAt: '2026-09-30T22:00:00.000Z',
  periodLabel: 'du 1er au 30 septembre 2026',
  totalHtCents: 10_000,
  totalVatCents: 550,
  totalTtcCents: 10_550,
  documentAvailable: false,
  settlement: { status: 'collection_planned', date: '2026-10-15', otherInvoicesOnDebit: 0 },
};

export const CREDIT_NOTE: MyIssuedInvoiceView = {
  ...SEPTEMBER,
  invoiceId: 'cn_1',
  number: 'FA-2026-000009',
  kind: 'credit_note',
  correctedInvoiceNumber: 'FA-2026-000007',
  dueOn: null,
  period: null,
  periodClosesAt: null,
  periodLabel: null,
  totalTtcCents: 1_055,
  settlement: null,
};

/** Une facture REJETÉE, PDF rendu, avec deux autres factures sur la même ligne. */
export const AUGUST_REJECTED: MyIssuedInvoiceView = {
  ...SEPTEMBER,
  invoiceId: 'inv_0',
  number: 'FA-2026-000004',
  issuedOn: '2026-08-31',
  period: '2026-08',
  periodLabel: 'du 1er au 31 août 2026',
  totalTtcCents: 20_000,
  documentAvailable: true,
  settlement: { status: 'collection_rejected', date: '2026-09-20', otherInvoicesOnDebit: 2 },
};

export const SEPTEMBER_DETAIL: IssuedInvoiceView = {
  invoiceId: SEPTEMBER.invoiceId,
  number: SEPTEMBER.number,
  kind: SEPTEMBER.kind,
  correctedInvoiceNumber: SEPTEMBER.correctedInvoiceNumber,
  issuedOn: SEPTEMBER.issuedOn,
  dueOn: SEPTEMBER.dueOn,
  period: SEPTEMBER.period,
  periodClosesAt: SEPTEMBER.periodClosesAt,
  periodLabel: SEPTEMBER.periodLabel,
  totalHtCents: SEPTEMBER.totalHtCents,
  totalVatCents: SEPTEMBER.totalVatCents,
  totalTtcCents: SEPTEMBER.totalTtcCents,
  payerCompanyId: 'cmp_1',
  seller: {
    name: 'La Folie Douce',
    legalForm: 'SAS',
    siren: '552100554',
    vatNumber: 'FR89552100554',
    rcs: 'Chambéry B 552 100 554',
    shareCapitalCents: 1_000_000,
    addressLines: ['12 rue du Fournil', '73000 Chambéry'],
  },
  buyer: {
    name: 'SAS Les Tommeuses',
    legalForm: 'SAS',
    siren: '812456789',
    vatNumber: 'FR45812456789',
    billingAddressLines: ['12 rue des Alpages'],
  },
  orders: [
    { reference: 'CMD-1', deliveredOn: '2026-09-12' },
    { reference: 'CMD-2', deliveredOn: null },
  ],
  lines: [
    {
      sku: 'PAIN',
      label: 'Pain du mois',
      unitCode: 'H87',
      quantityThousandths: 2_000,
      unitPriceMillicents: 500_000,
      vatRate: 5.5,
      amountCents: 10_000,
    },
  ],
  vat: {
    categories: [
      {
        rate: 5.5,
        goodsHtCents: 10_000,
        allowancesCents: 0,
        chargesCents: 0,
        taxableBaseCents: 10_000,
        vatCents: 550,
      },
    ],
    goodsHtCents: 10_000,
    allowancesCents: 0,
    chargesCents: 0,
  },
  mentions: {
    latePenaltyRateBasisPoints: 1_415,
    recoveryIndemnityCents: 4_000,
    earlyPaymentDiscount: 'néant',
  },
  mandateReference: 'RUM-PORT-1',
  paidOn: null,
  documentAvailable: false,
};
