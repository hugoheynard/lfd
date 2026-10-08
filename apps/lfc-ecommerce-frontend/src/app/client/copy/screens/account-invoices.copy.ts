/**
 * Ce que dit la section **« Mes factures »** de `/mon-compte`, dans les trois
 * langues (plan `documentation/comptabilite/facturation/plan-emission-de-la-facture.md`,
 * E6). À part de `account.copy.ts`, qui dépasse déjà la taille d'un fichier.
 *
 * Les montants, les numéros et les dates sont ceux de la pièce émise : le
 * texte ne les recalcule pas. Aucun statut de paiement : une facture émise
 * est une pièce, son règlement se suit ailleurs.
 */
export interface AccountInvoicesCopy {
  readonly loading: string;
  /** La lecture a échoué : ce n'est PAS « aucune facture », et on le dit. */
  readonly loadFailedTitle: string;
  readonly loadFailedBody: string;
  readonly none: string;
  /** `{n}` le nombre de pièces. */
  readonly count: string;
  readonly countOne: string;
  readonly invoice: string;
  readonly creditNote: string;
  /** `{date}`. */
  readonly issuedOn: string;
  /** `{date}`. */
  readonly dueOn: string;
  /** `{period}` : « septembre 2026 ». */
  readonly period: string;
  /** `{number}` : la facture qu'un avoir corrige. */
  readonly corrects: string;
  readonly open: string;
  readonly close: string;
  readonly detailLoading: string;
  readonly detailFailed: string;
  readonly seller: string;
  readonly buyer: string;
  readonly lines: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly amount: string;
  /** `{rate}`. */
  readonly vatRate: string;
  readonly goods: string;
  readonly allowances: string;
  readonly charges: string;
  readonly taxableBase: string;
  readonly vat: string;
  readonly totalHt: string;
  readonly totalVat: string;
  readonly totalTtc: string;
  readonly mentions: string;
  readonly latePenalty: string;
  readonly recoveryIndemnity: string;
  readonly earlyDiscount: string;
  readonly payment: string;
  /** `{rum}` : la référence du mandat figée sur la facture. */
  readonly directDebit: string;
  /** La facture carte, acquittée (lot E5a) : `{date}` = le jour du paiement. */
  readonly paidByCard: string;
  readonly orders: string;
  /** `{date}`. */
  readonly delivered: string;
  readonly notDelivered: string;
  /** Le PDF/A-3 n'est pas encore rendu (il suit l'émission, E3b) : la pièce se lit ici. */
  readonly pdfPending: string;
  /** Le bouton qui télécharge le PDF/A-3 Factur-X rangé. */
  readonly downloadPdf: string;
  /** Le téléchargement a échoué : la pièce, elle, est intacte. */
  readonly downloadFailed: string;
}

export const ACCOUNT_INVOICES_FR: AccountInvoicesCopy = {
  loading: 'Lecture de vos factures…',
  loadFailedTitle: 'Impossible de lire vos factures',
  loadFailedBody: 'La lecture a échoué — vos factures, elles, sont intactes.',
  none: 'Aucune facture pour l’instant. La facture du mois est émise le dernier jour du mois.',
  count: '{n} factures',
  countOne: '1 facture',
  invoice: 'Facture',
  creditNote: 'Avoir',
  issuedOn: 'émise le {date}',
  dueOn: 'échéance le {date}',
  period: 'commandes de {period}',
  corrects: 'corrige la facture {number}',
  open: 'Voir',
  close: 'Fermer',
  detailLoading: 'Lecture de la facture…',
  detailFailed: 'Impossible de lire cette facture. Réessayez dans un instant.',
  seller: 'Émise par',
  buyer: 'Adressée à',
  lines: 'Lignes',
  quantity: 'Quantité',
  unitPrice: 'Prix unitaire HT',
  amount: 'Montant HT',
  vatRate: 'TVA {rate}',
  goods: 'Marchandises HT',
  allowances: 'Remises',
  charges: 'Frais',
  taxableBase: 'Base imposable',
  vat: 'TVA',
  totalHt: 'Total HT',
  totalVat: 'Total TVA',
  totalTtc: 'Total TTC',
  mentions: 'Mentions',
  latePenalty: 'Pénalités de retard',
  recoveryIndemnity: 'Indemnité forfaitaire de recouvrement',
  earlyDiscount: 'Escompte pour paiement anticipé',
  payment: 'Règlement',
  directDebit: 'Prélèvement SEPA, mandat {rum}',
  paidByCard: 'Acquittée par carte le {date}',
  orders: 'Commandes facturées',
  delivered: 'livrée le {date}',
  notDelivered: 'livraison non constatée',
  pdfPending:
    'Le PDF de la facture est en préparation : il sera téléchargeable ici dans quelques minutes. Les informations ci-dessous sont celles de la facture émise.',
  downloadPdf: 'Télécharger le PDF',
  downloadFailed: 'Le PDF n’a pas pu être téléchargé. Réessayez dans un instant.',
};

export const ACCOUNT_INVOICES_EN: AccountInvoicesCopy = {
  loading: 'Loading your invoices…',
  loadFailedTitle: 'Your invoices could not be loaded',
  loadFailedBody: 'Loading failed — your invoices themselves are intact.',
  none: 'No invoice yet. The monthly invoice is issued on the last day of the month.',
  count: '{n} invoices',
  countOne: '1 invoice',
  invoice: 'Invoice',
  creditNote: 'Credit note',
  issuedOn: 'issued on {date}',
  dueOn: 'due on {date}',
  period: 'orders of {period}',
  corrects: 'corrects invoice {number}',
  open: 'View',
  close: 'Close',
  detailLoading: 'Loading the invoice…',
  detailFailed: 'This invoice could not be loaded. Please try again in a moment.',
  seller: 'Issued by',
  buyer: 'Billed to',
  lines: 'Lines',
  quantity: 'Quantity',
  unitPrice: 'Unit price excl. VAT',
  amount: 'Amount excl. VAT',
  vatRate: 'VAT {rate}',
  goods: 'Goods excl. VAT',
  allowances: 'Discounts',
  charges: 'Charges',
  taxableBase: 'Taxable base',
  vat: 'VAT',
  totalHt: 'Total excl. VAT',
  totalVat: 'Total VAT',
  totalTtc: 'Total incl. VAT',
  mentions: 'Terms',
  latePenalty: 'Late payment penalties',
  recoveryIndemnity: 'Fixed recovery indemnity',
  earlyDiscount: 'Early payment discount',
  payment: 'Payment',
  directDebit: 'SEPA direct debit, mandate {rum}',
  paidByCard: 'Paid by card on {date}',
  orders: 'Invoiced orders',
  delivered: 'delivered on {date}',
  notDelivered: 'delivery not recorded',
  pdfPending:
    'The PDF of this invoice is being prepared: it will be available here in a few minutes. The details below are those of the issued invoice.',
  downloadPdf: 'Download the PDF',
  downloadFailed: 'The PDF could not be downloaded. Please try again in a moment.',
};

export const ACCOUNT_INVOICES_IT: AccountInvoicesCopy = {
  loading: 'Lettura delle fatture…',
  loadFailedTitle: 'Impossibile leggere le fatture',
  loadFailedBody: 'La lettura non è riuscita — le fatture, invece, sono intatte.',
  none: 'Nessuna fattura per ora. La fattura del mese è emessa l’ultimo giorno del mese.',
  count: '{n} fatture',
  countOne: '1 fattura',
  invoice: 'Fattura',
  creditNote: 'Nota di credito',
  issuedOn: 'emessa il {date}',
  dueOn: 'scadenza il {date}',
  period: 'ordini di {period}',
  corrects: 'rettifica la fattura {number}',
  open: 'Apri',
  close: 'Chiudi',
  detailLoading: 'Lettura della fattura…',
  detailFailed: 'Impossibile leggere questa fattura. Riprova tra un istante.',
  seller: 'Emessa da',
  buyer: 'Intestata a',
  lines: 'Righe',
  quantity: 'Quantità',
  unitPrice: 'Prezzo unitario IVA esclusa',
  amount: 'Importo IVA esclusa',
  vatRate: 'IVA {rate}',
  goods: 'Merci IVA esclusa',
  allowances: 'Sconti',
  charges: 'Spese',
  taxableBase: 'Imponibile',
  vat: 'IVA',
  totalHt: 'Totale IVA esclusa',
  totalVat: 'Totale IVA',
  totalTtc: 'Totale IVA inclusa',
  mentions: 'Condizioni',
  latePenalty: 'Penali di mora',
  recoveryIndemnity: 'Indennità forfettaria di recupero',
  earlyDiscount: 'Sconto per pagamento anticipato',
  payment: 'Pagamento',
  directDebit: 'Addebito diretto SEPA, mandato {rum}',
  paidByCard: 'Pagata con carta il {date}',
  orders: 'Ordini fatturati',
  delivered: 'consegnato il {date}',
  notDelivered: 'consegna non registrata',
  pdfPending:
    'Il PDF della fattura è in preparazione: sarà scaricabile qui tra qualche minuto. I dati qui sotto sono quelli della fattura emessa.',
  downloadPdf: 'Scarica il PDF',
  downloadFailed: 'Impossibile scaricare il PDF. Riprova tra un istante.',
};
