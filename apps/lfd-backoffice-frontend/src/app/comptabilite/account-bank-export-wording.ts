import type { AccountBankExclusionReasonView, AccountBankExportSummaryView } from '@lfd/contracts';

import { parisDayLabel } from './mandate-bank-export-wording';

/**
 * Les mots de la carte « Comptes à la banque ». Ici plutôt qu'en valeur du
 * paquet de contrats, pour la même raison que ceux des mandats : la carte
 * n'importe de `@lfd/contracts` que des TYPES.
 */
export const ACCOUNT_BANK_EXCLUSION_LABELS: Readonly<
  Record<AccountBankExclusionReasonView, string>
> = {
  no_bic: 'RIB sans BIC — compléter le BIC du client',
};

/** « 1 compte », « 3 comptes ». */
export function accountsLabel(count: number): string {
  return `${String(count)} compte${count > 1 ? 's' : ''}`;
}

/** Où en est un export : importé, abandonné, ou en attente de la banque. */
export function accountExportStateLabel(item: AccountBankExportSummaryView): string {
  if (item.importedAt !== null) {
    return `importé le ${parisDayLabel(item.importedAt)}`;
  }
  if (item.abandonedAt !== null) {
    return `abandonné le ${parisDayLabel(item.abandonedAt)}`;
  }
  return 'en attente de la banque';
}
