import type { CollectionProcedureInvoicesView } from '@lfd/contracts';

/**
 * Les mots de l'onglet « Factures » de la procédure (2026-10-24). L'état et
 * les nombres viennent du serveur ; on ne fait que les dire.
 */

/** La phrase d'état, ou `null` quand le cadre de la page suffit (verrouillé, fait). */
export function invoicesSentence(view: CollectionProcedureInvoicesView): string | null {
  const unconfirmed = view.unconfirmedDeliveries.length;
  switch (view.reason) {
    case 'unconfirmed_deliveries':
      return (
        `${String(unconfirmed)} bon(s) de la période à constater : sans remise enregistrée, ` +
        'ils ne sont dans aucune facture. Les constater d’abord, puis émettre les factures.'
      );
    case 'missing_invoices':
      return (
        `${String(view.missingOrderCount)} bon(s) livré(s) sans facture : ` +
        'émettre les factures de la période (rejouable — une facture déjà émise ne l’est pas deux fois).'
      );
    case 'before_service':
      return 'Cette période se clôt avant la mise en service de la facture du mois : rien à y facturer.';
    case 'no_closure':
      return 'Aucune clôture de facturation pour cette procédure : rien à émettre.';
    case 'not_yet_issuable':
    case 'all_invoiced':
      return null;
  }
}
