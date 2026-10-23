import type {
  AccountBankExclusionReasonView,
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
      'Le compte rendu d’import CENET dit qu’il existe déjà : il reste tenu pour connu de la banque, et ne repartira pas.',
  },
};

/**
 * **« Saisi dans CENET »**, le seul geste d'un compte à exporter (doc § 2.6).
 * « Signalé par la banque » n'est plus une déclaration libre depuis le
 * 2026-10-23 : il se dit sur la ligne d'un export déposé (`reportGesturesOf`).
 */
export function knownGestureOf(
  standing: AccountBankStandingView,
): KnownBankAccountReasonView | null {
  return standing.kind === 'to_export' ? 'entered_in_cenet' : null;
}

/**
 * **Les gestes du compte rendu CENET sur une ligne** (Hugo, 2026-10-23) :
 * `pending` — dans un export pas encore déposé, visibles mais grisés ;
 * `open` — dans un export déposé, encore corrigeable ; `null` ailleurs.
 */
export type BankReportGestures = 'pending' | 'open' | null;

/** L'aide des gestes grisés : ce qui les ouvrira. */
export const BANK_REPORT_PENDING_HINT = 'Disponible après le dépôt dans CENET';

export function reportGesturesOf(standing: AccountBankStandingView): BankReportGestures {
  if (standing.kind === 'in_flight') {
    return 'pending';
  }
  return standing.kind === 'imported' && standing.correctable ? 'open' : null;
}

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
