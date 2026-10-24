/**
 * Ce que disent le filtre de jours, la sélection et le panneau du
 * **récapitulatif** de « Mes commandes », dans les trois langues (plan
 * `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, lot R3). À
 * part de `orders.copy.ts`, qui atteint déjà la taille d'un fichier.
 *
 * Les montants sont ceux que le serveur a sommés : le texte ne fait que les
 * nommer, dans l'ordre d'une facture.
 */
export interface OrderSummaryCopy {
  readonly filterFrom: string;
  readonly filterTo: string;
  readonly filterClear: string;
  /** §6.6 : une borne posée écarte les commandes sans date. */
  readonly filterUndated: string;
  /** `{n}` : le nombre de lignes cochées. */
  readonly selectedMany: string;
  readonly selectedOne: string;
  readonly selectedNone: string;
  /** `{max}` : le plafond. Dit avant qu'on le dépasse. */
  readonly capHint: string;
  /** `{max}` le plafond, `{extra}` combien en retirer. */
  readonly capExceeded: string;
  readonly selectAll: string;
  readonly selectRow: string;
  readonly open: string;
  readonly title: string;
  /** `{n}` : le nombre de commandes envoyées. */
  readonly selection: string;
  /** La période du filtre affiché — `{from}`, `{to}`. */
  readonly periodBetween: string;
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly loading: string;
  /** §6.4 : ce que les montants ne sont pas. */
  readonly amountsNote: string;
  readonly colProduct: string;
  readonly colSku: string;
  readonly colQuantity: string;
  readonly colHt: string;
  readonly orderCountMany: string;
  readonly orderCountOne: string;
  readonly subtotal: string;
  readonly discount: string;
  readonly voucher: string;
  readonly deliveryFee: string;
  readonly lateFee: string;
  /** `{rate}` : « 5,5 % ». */
  readonly vat: string;
  readonly unventilatedVat: string;
  readonly total: string;
  readonly grandTotal: string;
  readonly noneCounted: string;
  readonly excludedHead: string;
  readonly excludedCancelled: string;
  readonly excludedPending: string;
  readonly excludedFailed: string;
  readonly pdf: string;
  readonly csv: string;
  /** Un refus sans message lisible (réseau, panne). */
  readonly failed: string;
  readonly exportFailed: string;
  /** Les bons de commande inclus (§10) : HT seul, comme chaque bon l'imprime. */
  readonly ordersHead: string;
  readonly ordersNote: string;
  readonly colOrder: string;
  readonly colDay: string;
  readonly colMode: string;
  readonly colAuthor: string;
  readonly modePickup: string;
  readonly modeDelivery: string;
  /** L'auteur quand l'équipe a saisi la commande. */
  readonly authorTeam: string;
  readonly undated: string;
  readonly ordersPretax: string;
  /** `{causes}` : les gestes qui font l'écart, séparés par des virgules. */
  readonly ordersGap: string;
  readonly gapDiscount: string;
  readonly gapVoucher: string;
  readonly gapDelivery: string;
  readonly gapLateFee: string;
  readonly gapCapped: string;
}

export const ORDER_SUMMARY_FR: OrderSummaryCopy = {
  filterFrom: 'Du',
  filterTo: 'Au',
  filterClear: 'Effacer les dates',
  filterUndated: 'Les commandes sans date de retrait n’apparaissent pas.',
  selectedMany: '{n} sélectionnées',
  selectedOne: '1 sélectionnée',
  selectedNone: 'Aucune sélectionnée',
  capHint: 'Jusqu’à {max} commandes par récapitulatif.',
  capExceeded: 'Le récapitulatif porte au plus {max} commandes : retirez-en {extra}.',
  selectAll: 'Sélectionner toutes les commandes affichées',
  selectRow: 'Sélectionner la commande',
  open: 'Récapitulatif',
  title: 'Récapitulatif',
  selection: 'Sélection de {n} commandes',
  periodBetween: 'Retraits et livraisons du {from} au {to}',
  periodFrom: 'Retraits et livraisons à partir du {from}',
  periodTo: 'Retraits et livraisons jusqu’au {to}',
  loading: 'Récapitulatif en cours…',
  amountsNote:
    'Montants à la commande : remboursements et avoirs postérieurs non déduits. Le relevé comptable, ce sont les factures.',
  colProduct: 'Produit',
  colSku: 'SKU',
  colQuantity: 'Qté',
  colHt: 'Total HT',
  orderCountMany: '{n} commandes',
  orderCountOne: '1 commande',
  subtotal: 'Sous-total HT',
  discount: 'Remises',
  voucher: 'Bons de fidélité',
  deliveryFee: 'Livraison',
  lateFee: 'Surtaxes de commande tardive',
  vat: 'TVA {rate}',
  unventilatedVat: 'dont TVA non ventilée',
  total: 'Total TTC',
  grandTotal: 'Total général',
  noneCounted: 'Aucune commande comptée dans cette sélection.',
  excludedHead: 'Commandes exclues des totaux',
  excludedCancelled: 'annulée',
  excludedPending: 'paiement en attente',
  excludedFailed: 'paiement refusé',
  pdf: 'PDF',
  csv: 'Tableur',
  failed: 'Le récapitulatif n’a pas pu être établi. Réessayez dans un instant.',
  exportFailed: 'Le fichier n’a pas pu être produit. Réessayez dans un instant.',
  ordersHead: 'Bons de commande inclus',
  ordersNote: 'Montants HT tels que chaque bon les imprime — la TVA se calcule sur la facture.',
  colOrder: 'Bon',
  colDay: 'Jour',
  colMode: 'Mode',
  colAuthor: 'Auteur',
  modePickup: 'Retrait',
  modeDelivery: 'Livraison',
  authorTeam: 'l’équipe',
  undated: 'sans date',
  ordersPretax: 'Total HT des bons',
  ordersGap: 'Écart avec le sous-total HT : {causes}',
  gapDiscount: 'remises',
  gapVoucher: 'bons de fidélité',
  gapDelivery: 'livraison',
  gapLateFee: 'surtaxes de commande tardive',
  gapCapped: 'remise plafonnée au montant des articles',
};

export const ORDER_SUMMARY_EN: OrderSummaryCopy = {
  filterFrom: 'From',
  filterTo: 'To',
  filterClear: 'Clear dates',
  filterUndated: 'Orders without a pickup date are not shown.',
  selectedMany: '{n} selected',
  selectedOne: '1 selected',
  selectedNone: 'None selected',
  capHint: 'Up to {max} orders per summary.',
  capExceeded: 'A summary covers at most {max} orders: remove {extra}.',
  selectAll: 'Select every order shown',
  selectRow: 'Select the order',
  open: 'Summary',
  title: 'Summary',
  selection: 'Selection of {n} orders',
  periodBetween: 'Pickups and deliveries from {from} to {to}',
  periodFrom: 'Pickups and deliveries from {from}',
  periodTo: 'Pickups and deliveries until {to}',
  loading: 'Building the summary…',
  amountsNote:
    'Amounts as ordered: later refunds and credit notes are not deducted. The accounting statement is the invoices.',
  colProduct: 'Product',
  colSku: 'SKU',
  colQuantity: 'Qty',
  colHt: 'Total excl. VAT',
  orderCountMany: '{n} orders',
  orderCountOne: '1 order',
  subtotal: 'Subtotal excl. VAT',
  discount: 'Discounts',
  voucher: 'Loyalty vouchers',
  deliveryFee: 'Delivery',
  lateFee: 'Late order surcharges',
  vat: 'VAT {rate}',
  unventilatedVat: 'of which VAT not broken down',
  total: 'Total incl. VAT',
  grandTotal: 'Grand total',
  noneCounted: 'No order counted in this selection.',
  excludedHead: 'Orders left out of the totals',
  excludedCancelled: 'cancelled',
  excludedPending: 'payment pending',
  excludedFailed: 'payment refused',
  pdf: 'PDF',
  csv: 'Spreadsheet',
  failed: 'The summary could not be built. Try again in a moment.',
  exportFailed: 'The file could not be produced. Try again in a moment.',
  ordersHead: 'Order forms included',
  ordersNote:
    'Amounts excl. VAT as each order form prints them — VAT is worked out on the invoice.',
  colOrder: 'Order',
  colDay: 'Day',
  colMode: 'Mode',
  colAuthor: 'Placed by',
  modePickup: 'Pickup',
  modeDelivery: 'Delivery',
  authorTeam: 'our team',
  undated: 'no date',
  ordersPretax: 'Order forms total excl. VAT',
  ordersGap: 'Difference from the subtotal excl. VAT: {causes}',
  gapDiscount: 'discounts',
  gapVoucher: 'loyalty vouchers',
  gapDelivery: 'delivery',
  gapLateFee: 'late order surcharges',
  gapCapped: 'discount capped at the items amount',
};

export const ORDER_SUMMARY_IT: OrderSummaryCopy = {
  filterFrom: 'Dal',
  filterTo: 'Al',
  filterClear: 'Cancella le date',
  filterUndated: 'Gli ordini senza data di ritiro non compaiono.',
  selectedMany: '{n} selezionati',
  selectedOne: '1 selezionato',
  selectedNone: 'Nessuno selezionato',
  capHint: 'Fino a {max} ordini per riepilogo.',
  capExceeded: 'Il riepilogo comprende al massimo {max} ordini: togline {extra}.',
  selectAll: 'Seleziona tutti gli ordini visualizzati',
  selectRow: 'Seleziona l’ordine',
  open: 'Riepilogo',
  title: 'Riepilogo',
  selection: 'Selezione di {n} ordini',
  periodBetween: 'Ritiri e consegne dal {from} al {to}',
  periodFrom: 'Ritiri e consegne dal {from}',
  periodTo: 'Ritiri e consegne fino al {to}',
  loading: 'Riepilogo in corso…',
  amountsNote:
    'Importi all’ordine: rimborsi e note di credito successivi non dedotti. Il rendiconto contabile sono le fatture.',
  colProduct: 'Prodotto',
  colSku: 'SKU',
  colQuantity: 'Qtà',
  colHt: 'Totale IVA esclusa',
  orderCountMany: '{n} ordini',
  orderCountOne: '1 ordine',
  subtotal: 'Subtotale IVA esclusa',
  discount: 'Sconti',
  voucher: 'Buoni fedeltà',
  deliveryFee: 'Consegna',
  lateFee: 'Maggiorazioni per ordine tardivo',
  vat: 'IVA {rate}',
  unventilatedVat: 'di cui IVA non ripartita',
  total: 'Totale IVA inclusa',
  grandTotal: 'Totale generale',
  noneCounted: 'Nessun ordine conteggiato in questa selezione.',
  excludedHead: 'Ordini esclusi dai totali',
  excludedCancelled: 'annullato',
  excludedPending: 'pagamento in attesa',
  excludedFailed: 'pagamento rifiutato',
  pdf: 'PDF',
  csv: 'Foglio di calcolo',
  failed: 'Non è stato possibile preparare il riepilogo. Riprova tra un istante.',
  exportFailed: 'Non è stato possibile produrre il file. Riprova tra un istante.',
  ordersHead: 'Buoni d’ordine inclusi',
  ordersNote: 'Importi IVA esclusa come li stampa ogni buono — l’IVA si calcola in fattura.',
  colOrder: 'Buono',
  colDay: 'Giorno',
  colMode: 'Modalità',
  colAuthor: 'Autore',
  modePickup: 'Ritiro',
  modeDelivery: 'Consegna',
  authorTeam: 'il nostro team',
  undated: 'senza data',
  ordersPretax: 'Totale buoni IVA esclusa',
  ordersGap: 'Differenza dal subtotale IVA esclusa: {causes}',
  gapDiscount: 'sconti',
  gapVoucher: 'buoni fedeltà',
  gapDelivery: 'consegna',
  gapLateFee: 'maggiorazioni per ordine tardivo',
  gapCapped: 'sconto limitato all’importo degli articoli',
};
