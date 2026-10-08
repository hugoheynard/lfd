import type { IssuedInvoiceSummaryView, IssuedInvoiceView } from '@lfd/contracts';

/**
 * Des pièces de « Mes factures » pour les specs (E6). Les dates ne sont
 * qu'affichées : aucune n'est comparée à l'horloge.
 */
export const SEPTEMBER: IssuedInvoiceSummaryView = {
  invoiceId: 'inv_1',
  number: 'FA-2026-000007',
  kind: 'invoice',
  correctedInvoiceNumber: null,
  issuedOn: '2026-09-30',
  dueOn: '2026-10-15',
  period: '2026-09',
  totalHtCents: 10_000,
  totalVatCents: 550,
  totalTtcCents: 10_550,
  documentAvailable: false,
};

export const CREDIT_NOTE: IssuedInvoiceSummaryView = {
  ...SEPTEMBER,
  invoiceId: 'cn_1',
  number: 'FA-2026-000009',
  kind: 'credit_note',
  correctedInvoiceNumber: 'FA-2026-000007',
  dueOn: null,
  period: null,
  totalTtcCents: 1_055,
};

export const SEPTEMBER_DETAIL: IssuedInvoiceView = {
  ...SEPTEMBER,
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
  documentAvailable: false,
};
