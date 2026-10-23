import type {
  AccountBankExclusionReasonView,
  AccountBankExportSummaryView,
  AccountBankStandingView,
  KnownBankAccountReasonView,
} from '@lfd/contracts';

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

/**
 * Les deux gestes qui retirent un compte de l'export (doc
 * `prerequis-export-ribs.md` § 2.6) : le bouton, et la phrase de la
 * confirmation qui dit ce qu'on atteste.
 */
export const KNOWN_REASON_GESTURES: Readonly<
  Record<KnownBankAccountReasonView, { readonly button: string; readonly confirm: string }>
> = {
  entered_in_cenet: {
    button: 'Importé dans CENET directement',
    confirm:
      'Vous l’avez saisi à la main dans CENET : il ne partira plus dans le fichier des comptes.',
  },
  reported_by_bank: {
    button: 'Signalé comme connu par la banque',
    confirm:
      'Le compte rendu d’import CENET (ou la banque) dit qu’il existe déjà : il ne partira plus dans le fichier des comptes.',
  },
};

/** Où en est un compte, en une ligne de la colonne « État ». */
export function accountStandingLabel(standing: AccountBankStandingView): string {
  switch (standing.kind) {
    case 'to_export':
      return 'à exporter';
    case 'in_flight':
      return 'en export';
    case 'imported':
      return `importé le ${parisDayLabel(standing.at)}`;
    case 'declared':
      return standing.reason === 'entered_in_cenet'
        ? `saisi dans CENET le ${parisDayLabel(standing.at)}`
        : `signalé par la banque le ${parisDayLabel(standing.at)}`;
    case 'excluded':
      return `écarté : ${ACCOUNT_BANK_EXCLUSION_LABELS[standing.reason]}`;
  }
}
