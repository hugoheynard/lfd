/**
 * Ce que dit la carte « Ma fidélité », dans les trois langues (plan
 * `documentation/comptabilite/fidelite/plan-points-de-fidelite.md`, §12, E1.3).
 *
 * Un bon s'écrit **toujours avec sa mention HT** : c'est sa vraie valeur
 * (§9), et la baisse au paiement est un peu plus grande, TVA comprise —
 * `vatNote` le dit une fois, sous la conversion.
 *
 * Découpé du dictionnaire général pour la même raison que [[orders.copy]].
 */
export interface LoyaltyCopy {
  readonly title: string;
  readonly lead: string;
  /** La page ouverte par un particulier quand le programme est fermé (un favori) : rien ne dit « bientôt ». */
  readonly closedTitle: string;
  readonly balanceLabel: string;
  /** `{n}` = un nombre de points déjà mis en forme. */
  readonly points: string;
  /** `{points}` = les points d'un palier, `{value}` = sa valeur HT mise en forme. */
  readonly stepWorth: string;
  readonly convertibleNone: string;
  readonly convertibleOne: string;
  /** `{n}` = le nombre de paliers convertibles. */
  readonly convertibleMany: string;
  readonly stepsLabel: string;
  /** `{n}` = le nombre de paliers, `{value}` = la valeur HT du bon qu'ils donnent. */
  readonly stepOption: string;
  readonly convert: string;
  /** `{points}` = les points dépensés, `{value}` = la valeur HT du bon. */
  readonly confirmMessage: string;
  readonly confirm: string;
  readonly cancel: string;
  readonly busy: string;
  /** `{value}` = la valeur HT du bon émis. */
  readonly converted: string;
  readonly balanceChanged: string;
  readonly convertFailed: string;
  readonly vatNote: string;
  readonly vouchersTitle: string;
  /** `{value}` = la valeur HT du bon. */
  readonly voucherValue: string;
  /** `{date}` = la date limite, en toutes lettres. */
  readonly voucherUntil: string;
  /** `{order}` = le numéro de la commande qui porte le bon. */
  readonly voucherUsedOn: string;
  readonly voucherExpired: string;
  readonly voucherCancelled: string;
  readonly historyTitle: string;
  /** `{order}` = le numéro de la commande qui a rapporté les points. */
  readonly entryEarned: string;
  readonly entryEarnedNoOrder: string;
  readonly entryConverted: string;
  readonly entryAdjusted: string;
  readonly emptyTitle: string;
  readonly emptyBody: string;
  readonly loading: string;
  readonly loadFailedTitle: string;
  readonly loadFailedBody: string;
  readonly retry: string;
}

export const LOYALTY_FR: LoyaltyCopy = {
  title: 'Ma fidélité',
  lead: 'Vos points, vos bons, et ce qu’ils vous ont rapporté.',
  closedTitle: 'Le programme de fidélité n’est pas ouvert.',
  balanceLabel: 'Votre solde',
  points: '{n} points',
  stepWorth: '{points} points = un bon de {value} HT',
  convertibleNone: 'Pas encore assez de points pour un bon.',
  convertibleOne: 'Vous pouvez convertir 1 palier.',
  convertibleMany: 'Vous pouvez convertir jusqu’à {n} paliers.',
  stepsLabel: 'Nombre de paliers',
  stepOption: '{n} palier(s) — un bon de {value} HT',
  convert: 'Convertir en bon',
  confirmMessage: 'Convertir {points} points en un bon de {value} HT ?',
  confirm: 'Convertir',
  cancel: 'Annuler',
  busy: 'Conversion…',
  converted: 'Votre bon de {value} HT est prêt.',
  balanceChanged:
    'Votre solde a changé entre-temps : nous l’avons rechargé. Vérifiez le nombre de paliers, puis recommencez.',
  convertFailed: 'La conversion n’a pas abouti. Réessayez dans un instant.',
  vatNote:
    'Un bon réduit le prix hors taxe de vos achats ; la baisse sur votre total est un peu plus grande, TVA comprise.',
  vouchersTitle: 'Mes bons',
  voucherValue: '{value} HT',
  voucherUntil: 'valable jusqu’au {date}',
  voucherUsedOn: 'utilisé sur {order}',
  voucherExpired: 'expiré',
  voucherCancelled: 'annulé',
  historyTitle: 'Historique',
  entryEarned: 'Commande {order}',
  entryEarnedNoOrder: 'Commande',
  entryConverted: 'Conversion en bon',
  entryAdjusted: 'Ajustement',
  emptyTitle: 'Pas encore de points',
  emptyBody: 'Vos commandes vous en rapportent une fois retirées et réglées.',
  loading: 'Lecture de votre fidélité…',
  loadFailedTitle: 'Votre fidélité n’a pas pu être lue',
  loadFailedBody: 'Vos points sont en sécurité. Réessayez dans un instant.',
  retry: 'Réessayer',
};

export const LOYALTY_EN: LoyaltyCopy = {
  title: 'My loyalty',
  lead: 'Your points, your vouchers, and what they earned you.',
  closedTitle: 'The loyalty programme is not open.',
  balanceLabel: 'Your balance',
  points: '{n} points',
  stepWorth: '{points} points = a {value} voucher (excl. VAT)',
  convertibleNone: 'Not enough points for a voucher yet.',
  convertibleOne: 'You can convert 1 step.',
  convertibleMany: 'You can convert up to {n} steps.',
  stepsLabel: 'Number of steps',
  stepOption: '{n} step(s) — a {value} voucher (excl. VAT)',
  convert: 'Convert to a voucher',
  confirmMessage: 'Convert {points} points into a {value} voucher (excl. VAT)?',
  confirm: 'Convert',
  cancel: 'Cancel',
  busy: 'Converting…',
  converted: 'Your {value} voucher (excl. VAT) is ready.',
  balanceChanged:
    'Your balance changed in the meantime: we reloaded it. Check the number of steps, then try again.',
  convertFailed: 'The conversion did not go through. Please try again shortly.',
  vatNote:
    'A voucher lowers the price of your purchases before VAT; the drop in your total is slightly larger, VAT included.',
  vouchersTitle: 'My vouchers',
  voucherValue: '{value} excl. VAT',
  voucherUntil: 'valid until {date}',
  voucherUsedOn: 'used on {order}',
  voucherExpired: 'expired',
  voucherCancelled: 'cancelled',
  historyTitle: 'History',
  entryEarned: 'Order {order}',
  entryEarnedNoOrder: 'Order',
  entryConverted: 'Converted to a voucher',
  entryAdjusted: 'Adjustment',
  emptyTitle: 'No points yet',
  emptyBody: 'Your orders earn points once collected and paid.',
  loading: 'Reading your loyalty…',
  loadFailedTitle: 'Your loyalty could not be read',
  loadFailedBody: 'Your points are safe. Please try again shortly.',
  retry: 'Try again',
};

export const LOYALTY_IT: LoyaltyCopy = {
  title: 'La mia fedeltà',
  lead: 'I tuoi punti, i tuoi buoni e quello che ti hanno fruttato.',
  closedTitle: 'Il programma fedeltà non è aperto.',
  balanceLabel: 'Il tuo saldo',
  points: '{n} punti',
  stepWorth: '{points} punti = un buono da {value} IVA esclusa',
  convertibleNone: 'Non hai ancora abbastanza punti per un buono.',
  convertibleOne: 'Puoi convertire 1 soglia.',
  convertibleMany: 'Puoi convertire fino a {n} soglie.',
  stepsLabel: 'Numero di soglie',
  stepOption: '{n} soglia/e — un buono da {value} IVA esclusa',
  convert: 'Converti in buono',
  confirmMessage: 'Convertire {points} punti in un buono da {value} IVA esclusa?',
  confirm: 'Converti',
  cancel: 'Annulla',
  busy: 'Conversione…',
  converted: 'Il tuo buono da {value} IVA esclusa è pronto.',
  balanceChanged:
    'Il tuo saldo è cambiato nel frattempo: lo abbiamo ricaricato. Controlla il numero di soglie e riprova.',
  convertFailed: 'La conversione non è riuscita. Riprova tra un istante.',
  vatNote:
    'Un buono riduce il prezzo dei tuoi acquisti al netto dell’IVA; il calo sul totale è un po’ più grande, IVA inclusa.',
  vouchersTitle: 'I miei buoni',
  voucherValue: '{value} IVA esclusa',
  voucherUntil: 'valido fino al {date}',
  voucherUsedOn: 'usato su {order}',
  voucherExpired: 'scaduto',
  voucherCancelled: 'annullato',
  historyTitle: 'Storico',
  entryEarned: 'Ordine {order}',
  entryEarnedNoOrder: 'Ordine',
  entryConverted: 'Conversione in buono',
  entryAdjusted: 'Rettifica',
  emptyTitle: 'Ancora nessun punto',
  emptyBody: 'I tuoi ordini ne fanno guadagnare una volta ritirati e pagati.',
  loading: 'Lettura della tua fedeltà…',
  loadFailedTitle: 'Impossibile leggere la tua fedeltà',
  loadFailedBody: 'I tuoi punti sono al sicuro. Riprova tra un istante.',
  retry: 'Riprova',
};
