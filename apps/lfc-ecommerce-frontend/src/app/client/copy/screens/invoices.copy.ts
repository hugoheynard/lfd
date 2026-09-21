/**
 * Ce que dit `/mes-factures`, dans les trois langues.
 *
 * Un mot y porte une décision : la plateforme **n'émet aucune facture**. Elle
 * rassemble les commandes telles qu'elles se reportent en comptabilité, et la
 * facture arrive par e-mail après la clôture. Appeler « factures » une liste de
 * commandes ferait chercher un PDF qui n'existe pas — d'où `honesty`, qui est
 * la première ligne de l'écran et non une note de bas de page.
 *
 * Découpé du dictionnaire général pour la même raison que [[orders.copy]].
 */
export interface InvoicesCopy {
  readonly title: string;
  readonly lead: string;
  readonly honesty: string;
  readonly tileOpen: string;
  readonly tileClosed: string;
  readonly tilePerOrder: string;
  readonly csv: string;
  readonly csvYear: string;
  readonly current: string;
  readonly colAccount: string;
  readonly colPerOrder: string;
  readonly colAccountNote: string;
  readonly colPerOrderNote: string;
  readonly noneCell: string;
  /** `{n}` est remplacé par le nombre de commandes du registre. */
  readonly ordersCount: string;
  readonly invoiceDownload: string;
  readonly invoicePending: string;
  readonly stateDue: string;
  readonly statePaid: string;
}

export const INVOICES_FR: InvoicesCopy = {
  title: 'Mes factures',
  lead: 'Le relevé de vos commandes, mois par mois — au compte et à la commande.',
  honesty:
    'Aucune facture n’est émise ici. Ce relevé rassemble vos commandes telles qu’elles partiront en comptabilité — la facture, elle, arrive par e-mail après la clôture du mois.',
  tileOpen: 'Période en cours',
  tileClosed: 'Mois clos',
  tilePerOrder: 'À la commande',
  csv: 'Relevé CSV',
  csvYear: 'Exporter l’exercice · CSV',
  current: 'En cours',
  colAccount: 'Au compte · à facturer',
  colPerOrder: 'À la commande · hors mensuel',
  colAccountNote: 'ce qui part sur la facture du mois',
  colPerOrderNote: 'déjà réglé, avec son moyen de paiement',
  noneCell: '—',
  ordersCount: '{n} commandes',
  invoiceDownload: 'Télécharger la facture',
  invoicePending: 'La facture de ce mois arrivera après la clôture, déposée par notre comptable.',
  stateDue: 'À régler',
  statePaid: 'Réglée',
};

export const INVOICES_EN: InvoicesCopy = {
  title: 'My invoices',
  lead: 'The statement of your orders, month by month — on account and at checkout.',
  honesty:
    'No invoice is issued here. This statement gathers your orders as they will go to accounting — the invoice itself arrives by e-mail once the month is closed.',
  tileOpen: 'Current period',
  tileClosed: 'Closed months',
  tilePerOrder: 'At checkout',
  csv: 'CSV statement',
  csvYear: 'Export the year · CSV',
  current: 'Open',
  colAccount: 'On account · to be invoiced',
  colPerOrder: 'At checkout · outside the monthly bill',
  colAccountNote: 'what goes on the month’s invoice',
  colPerOrderNote: 'already paid, with its payment method',
  noneCell: '—',
  ordersCount: '{n} orders',
  invoiceDownload: 'Download the invoice',
  invoicePending: 'This month’s invoice arrives after closing, filed by our accountant.',
  stateDue: 'To settle',
  statePaid: 'Settled',
};

export const INVOICES_IT: InvoicesCopy = {
  title: 'Le mie fatture',
  lead: 'Il riepilogo dei vostri ordini, mese per mese — sul conto e all’ordine.',
  honesty:
    'Qui non viene emessa nessuna fattura. Questo riepilogo raccoglie i vostri ordini come andranno in contabilità — la fattura arriva per e-mail dopo la chiusura del mese.',
  tileOpen: 'Periodo in corso',
  tileClosed: 'Mesi chiusi',
  tilePerOrder: 'All’ordine',
  csv: 'Riepilogo CSV',
  csvYear: 'Esportare l’esercizio · CSV',
  current: 'In corso',
  colAccount: 'Sul conto · da fatturare',
  colPerOrder: 'All’ordine · fuori mensile',
  colAccountNote: 'quello che finisce sulla fattura del mese',
  colPerOrderNote: 'già pagato, con il suo mezzo di pagamento',
  noneCell: '—',
  ordersCount: '{n} ordini',
  invoiceDownload: 'Scaricare la fattura',
  invoicePending:
    'La fattura di questo mese arriverà dopo la chiusura, depositata dal nostro commercialista.',
  stateDue: 'Da saldare',
  statePaid: 'Saldata',
};
