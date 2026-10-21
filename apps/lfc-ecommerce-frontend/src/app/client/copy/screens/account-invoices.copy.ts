/**
 * Ce que dit la page **« Mes factures »** (`/mes-factures`) et le dialogue
 * d'une pièce, dans les trois langues (plans
 * `documentation/comptabilite/facturation/facture-emise.md` et
 * `plan-page-mes-factures.md`). À part de `account.copy.ts`, qui dépasse déjà
 * la taille d'un fichier.
 *
 * Les montants, les numéros et les dates sont ceux de la pièce émise : le
 * texte ne les recalcule pas. Le statut de règlement est DÉRIVÉ par le
 * serveur ; le texte ne fait que le nommer.
 */
export interface AccountInvoicesCopy {
  readonly loading: string;
  /** La lecture a échoué : ce n'est PAS « aucune facture », et on le dit. */
  readonly loadFailedTitle: string;
  readonly loadFailedBody: string;
  /** Le bandeau de la page. */
  readonly title: string;
  readonly lead: string;
  /** Aucune pièce du tout — le titre ; `none` en est le corps. */
  readonly noneTitle: string;
  readonly none: string;
  /** Les filtres ne retiennent rien. */
  readonly noneFilteredTitle: string;
  readonly noneFiltered: string;
  /** Un rôle sans `owner|billing` : l'API refuserait, l'écran le dit. */
  readonly forbiddenTitle: string;
  readonly forbidden: string;
  /** Le total dû. */
  readonly dueTitle: string;
  /** `{n}` le nombre de factures qu'il compte. */
  readonly dueCount: string;
  readonly dueCountOne: string;
  readonly dueNothing: string;
  /** `{n}` rejetées, `{amount}` leur montant. */
  readonly dueRejected: string;
  readonly dueRejectedOne: string;
  /** Le total est l'état du compte : il ne suit pas les filtres (§7.3). */
  readonly dueNote: string;
  /** Les avoirs, à part : `{n}` et `{amount}` — ceux de la liste affichée. */
  readonly creditNotesShown: string;
  readonly creditNotesShownOne: string;
  readonly filterYear: string;
  readonly filterMonth: string;
  readonly filterKind: string;
  readonly allYears: string;
  readonly allMonths: string;
  readonly kindAll: string;
  readonly kindInvoices: string;
  readonly kindCreditNotes: string;
  readonly colNumber: string;
  readonly colKind: string;
  readonly colPeriod: string;
  readonly colIssued: string;
  readonly colTotal: string;
  readonly colStatus: string;
  readonly colActions: string;
  readonly statusCardPaid: string;
  readonly statusCollectionPlanned: string;
  readonly statusCollected: string;
  readonly statusRejected: string;
  readonly statusRecollectionPlanned: string;
  readonly statusSettled: string;
  readonly statusClosed: string;
  readonly statusProcessing: string;
  /** Ce que « En cours de traitement » promet. */
  readonly processingHint: string;
  /** `{date}` — accolé au statut. */
  readonly statusOn: string;
  /** `{n}` les autres factures du même prélèvement rejeté. */
  readonly rejectedWith: string;
  readonly rejectedWithOne: string;
  /** Un avoir n'a pas de statut de règlement. */
  readonly noStatus: string;
  readonly download: string;
  /** `{number}` — le nom de la case d'une ligne. */
  readonly selectRow: string;
  readonly selectAll: string;
  /** `{n}` pièces cochées. */
  readonly downloadSelection: string;
  readonly downloadShown: string;
  /** Le refus du serveur n'a pas de message lisible. */
  readonly archiveFailed: string;
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
  title: 'Mes factures',
  lead: 'Vos factures et avoirs, leur règlement, et leurs PDF.',
  noneTitle: 'Aucune facture',
  none: 'Aucune facture pour l’instant. La facture du mois est émise le dernier jour du mois.',
  noneFilteredTitle: 'Aucune pièce pour ces filtres',
  noneFiltered: 'Changez l’année, le mois ou le type pour en voir d’autres.',
  forbiddenTitle: 'Factures réservées',
  forbidden:
    'Seuls le titulaire du compte et le contact comptabilité voient les factures de la société.',
  dueTitle: 'Total dû',
  dueCount: '{n} factures à prélever',
  dueCountOne: '1 facture à prélever',
  dueNothing: 'Rien à régler pour l’instant.',
  dueRejected: 'dont {n} rejetées ({amount}) — à régulariser',
  dueRejectedOne: 'dont 1 rejetée ({amount}) — à régulariser',
  dueNote:
    'L’état de votre compte : ce total ne suit pas les filtres. Les avoirs n’en sont pas déduits.',
  creditNotesShown: '{n} avoirs dans la liste : {amount}',
  creditNotesShownOne: '1 avoir dans la liste : {amount}',
  filterYear: 'Année',
  filterMonth: 'Mois',
  filterKind: 'Pièces',
  allYears: 'Toutes',
  allMonths: 'Tous',
  kindAll: 'Tout',
  kindInvoices: 'Factures',
  kindCreditNotes: 'Avoirs',
  colNumber: 'Numéro',
  colKind: 'Type',
  colPeriod: 'Période',
  colIssued: 'Émise le',
  colTotal: 'TTC',
  colStatus: 'Statut',
  colActions: 'Pièce',
  statusCardPaid: 'Acquittée par carte',
  statusCollectionPlanned: 'Prélèvement prévu',
  statusCollected: 'Prélevée',
  statusRejected: 'Prélèvement rejeté — à régulariser',
  statusRecollectionPlanned: 'Nouveau prélèvement prévu',
  statusSettled: 'Réglée',
  statusClosed: 'Clôturée',
  statusProcessing: 'En cours de traitement',
  processingHint: 'notre équipe s’en occupe',
  statusOn: 'le {date}',
  rejectedWith: 'rejeté avec {n} autres factures du même prélèvement',
  rejectedWithOne: 'rejeté avec 1 autre facture du même prélèvement',
  noStatus: '—',
  download: 'PDF',
  selectRow: 'Sélectionner {number}',
  selectAll: 'Tout sélectionner',
  downloadSelection: 'Télécharger la sélection ({n})',
  downloadShown: 'Télécharger tout ce qui est affiché',
  archiveFailed: 'Le zip n’a pas pu être préparé. Réessayez dans un instant.',
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
  title: 'My invoices',
  lead: 'Your invoices and credit notes, their payment, and their PDFs.',
  noneTitle: 'No invoice',
  none: 'No invoice yet. The monthly invoice is issued on the last day of the month.',
  noneFilteredTitle: 'Nothing matches these filters',
  noneFiltered: 'Change the year, month or type to see others.',
  forbiddenTitle: 'Invoices are restricted',
  forbidden: 'Only the account holder and the billing contact can see the company’s invoices.',
  dueTitle: 'Amount due',
  dueCount: '{n} invoices to be debited',
  dueCountOne: '1 invoice to be debited',
  dueNothing: 'Nothing to pay for now.',
  dueRejected: 'of which {n} rejected ({amount}) — to be settled',
  dueRejectedOne: 'of which 1 rejected ({amount}) — to be settled',
  dueNote:
    'The state of your account: this total ignores the filters. Credit notes are not deducted.',
  creditNotesShown: '{n} credit notes in the list: {amount}',
  creditNotesShownOne: '1 credit note in the list: {amount}',
  filterYear: 'Year',
  filterMonth: 'Month',
  filterKind: 'Documents',
  allYears: 'All',
  allMonths: 'All',
  kindAll: 'All',
  kindInvoices: 'Invoices',
  kindCreditNotes: 'Credit notes',
  colNumber: 'Number',
  colKind: 'Type',
  colPeriod: 'Period',
  colIssued: 'Issued on',
  colTotal: 'Incl. VAT',
  colStatus: 'Status',
  colActions: 'Document',
  statusCardPaid: 'Paid by card',
  statusCollectionPlanned: 'Direct debit scheduled',
  statusCollected: 'Debited',
  statusRejected: 'Direct debit rejected — to be settled',
  statusRecollectionPlanned: 'New direct debit scheduled',
  statusSettled: 'Settled',
  statusClosed: 'Closed',
  statusProcessing: 'Being processed',
  processingHint: 'our team is on it',
  statusOn: 'on {date}',
  rejectedWith: 'rejected with {n} other invoices of the same debit',
  rejectedWithOne: 'rejected with 1 other invoice of the same debit',
  noStatus: '—',
  download: 'PDF',
  selectRow: 'Select {number}',
  selectAll: 'Select all',
  downloadSelection: 'Download the selection ({n})',
  downloadShown: 'Download everything shown',
  archiveFailed: 'The zip could not be prepared. Please try again in a moment.',
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
  title: 'Le mie fatture',
  lead: 'Le fatture e le note di credito, il loro pagamento e i loro PDF.',
  noneTitle: 'Nessuna fattura',
  none: 'Nessuna fattura per ora. La fattura del mese è emessa l’ultimo giorno del mese.',
  noneFilteredTitle: 'Nessun documento per questi filtri',
  noneFiltered: 'Cambia anno, mese o tipo per vederne altri.',
  forbiddenTitle: 'Fatture riservate',
  forbidden:
    'Solo il titolare del conto e il contatto amministrativo vedono le fatture della società.',
  dueTitle: 'Totale dovuto',
  dueCount: '{n} fatture da addebitare',
  dueCountOne: '1 fattura da addebitare',
  dueNothing: 'Niente da pagare per ora.',
  dueRejected: 'di cui {n} respinte ({amount}) — da regolarizzare',
  dueRejectedOne: 'di cui 1 respinta ({amount}) — da regolarizzare',
  dueNote:
    'Lo stato del conto: questo totale non segue i filtri. Le note di credito non vengono detratte.',
  creditNotesShown: '{n} note di credito nell’elenco: {amount}',
  creditNotesShownOne: '1 nota di credito nell’elenco: {amount}',
  filterYear: 'Anno',
  filterMonth: 'Mese',
  filterKind: 'Documenti',
  allYears: 'Tutti',
  allMonths: 'Tutti',
  kindAll: 'Tutto',
  kindInvoices: 'Fatture',
  kindCreditNotes: 'Note di credito',
  colNumber: 'Numero',
  colKind: 'Tipo',
  colPeriod: 'Periodo',
  colIssued: 'Emessa il',
  colTotal: 'IVA incl.',
  colStatus: 'Stato',
  colActions: 'Documento',
  statusCardPaid: 'Pagata con carta',
  statusCollectionPlanned: 'Addebito previsto',
  statusCollected: 'Addebitata',
  statusRejected: 'Addebito respinto — da regolarizzare',
  statusRecollectionPlanned: 'Nuovo addebito previsto',
  statusSettled: 'Saldata',
  statusClosed: 'Chiusa',
  statusProcessing: 'In lavorazione',
  processingHint: 'se ne occupa il nostro team',
  statusOn: 'il {date}',
  rejectedWith: 'respinto con altre {n} fatture dello stesso addebito',
  rejectedWithOne: 'respinto con un’altra fattura dello stesso addebito',
  noStatus: '—',
  download: 'PDF',
  selectRow: 'Seleziona {number}',
  selectAll: 'Seleziona tutto',
  downloadSelection: 'Scarica la selezione ({n})',
  downloadShown: 'Scarica tutto ciò che è visualizzato',
  archiveFailed: 'Impossibile preparare lo zip. Riprova tra un istante.',
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
