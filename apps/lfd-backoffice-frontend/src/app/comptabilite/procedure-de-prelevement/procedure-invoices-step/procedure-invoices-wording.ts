import type {
  CollectionProcedureInvoicesView,
  ProcedureOrderFiguresView,
  ProcedureOrderStatusView,
} from '@lfd/contracts';

/**
 * Les mots de l'onglet « Factures » de la procédure (Hugo, 2026-10-24). Le
 * statut de chaque commande et les nombres viennent du serveur ; on ne fait
 * que les dire, au même vocabulaire partout : la liste, les chiffres, la phrase.
 */

/** Le statut d'une commande, tel que la liste l'écrit. */
export const STATUS_LABELS: Readonly<Record<ProcedureOrderStatusView, string>> = {
  receipt_to_confirm: 'Réception à confirmer',
  receipt_confirmed: 'Réception confirmée',
  invoiced: 'Facturée',
  awaiting_remainder: 'Partielle — reste à relivrer',
};

/** Les trois chiffres clés, dans l'ordre des gestes : confirmer, émettre, c'est fait. */
export const FIGURE_ORDER: readonly ProcedureOrderStatusView[] = [
  'receipt_to_confirm',
  'receipt_confirmed',
  'invoiced',
  'awaiting_remainder',
];

export const FIGURE_LABELS: Readonly<Record<ProcedureOrderStatusView, string>> = {
  receipt_to_confirm: 'Réceptions à confirmer',
  receipt_confirmed: 'Réceptions confirmées à facturer',
  invoiced: 'Facturées',
  awaiting_remainder: 'Partielles — reste à relivrer',
};

/** Le chiffre d'un statut. */
export function figureOf(
  figures: ProcedureOrderFiguresView,
  status: ProcedureOrderStatusView,
): number {
  switch (status) {
    case 'receipt_to_confirm':
      return figures.receiptToConfirm;
    case 'receipt_confirmed':
      return figures.receiptConfirmed;
    case 'invoiced':
      return figures.invoiced;
    case 'awaiting_remainder':
      return figures.awaitingRemainder;
  }
}

/** Le libellé du bouton global, compté. */
export function issueLabel(count: number): string {
  return `Émettre les factures des réceptions confirmées (${String(count)})`;
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count > 1 ? many : one}`;
}

/**
 * La phrase d'état, unique : « 12 facturées, 2 réceptions confirmées à
 * facturer, 3 réceptions à confirmer » ; « Toutes les commandes de la période
 * sont facturées. » quand plus rien n'attend. Un nombre nul n'est pas dit.
 */
export function invoicesSentence(view: CollectionProcedureInvoicesView): string {
  switch (view.reason) {
    case 'before_service':
      return 'Cette période se clôt avant la mise en service de la facture du mois : rien à y facturer.';
    case 'no_closure':
      return 'Aucune clôture de facturation pour cette procédure : rien à émettre.';
    default:
      return figuresSentence(view.figures);
  }
}

function figuresSentence(figures: ProcedureOrderFiguresView): string {
  if (
    figures.receiptConfirmed === 0 &&
    figures.receiptToConfirm === 0 &&
    figures.awaitingRemainder === 0
  ) {
    return figures.invoiced === 0
      ? 'Aucune commande au compte dans la période.'
      : 'Toutes les commandes de la période sont facturées.';
  }
  const parts = [
    figures.invoiced === 0 ? null : plural(figures.invoiced, 'facturée', 'facturées'),
    figures.receiptConfirmed === 0
      ? null
      : plural(
          figures.receiptConfirmed,
          'réception confirmée à facturer',
          'réceptions confirmées à facturer',
        ),
    figures.receiptToConfirm === 0
      ? null
      : plural(figures.receiptToConfirm, 'réception à confirmer', 'réceptions à confirmer'),
    // Décision de Hugo du 2026-10-26 : une partielle se dit, sans être « à facturer ».
    figures.awaitingRemainder === 0
      ? null
      : plural(
          figures.awaitingRemainder,
          'partielle, reste à relivrer',
          'partielles, reste à relivrer',
        ),
  ];
  return `${parts.filter((part) => part !== null).join(', ')}.`;
}
