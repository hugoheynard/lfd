import type { AccountBankRowView } from '@lfd/contracts';

/** Ce que filtre un chiffre clé : « connus » réunit importés et déclarés. */
export type AccountBankFilter = 'to_export' | 'in_flight' | 'known';

export interface AccountBankFigure {
  readonly filter: AccountBankFilter;
  readonly count: number;
  readonly label: string;
}

export const FILTER_LABELS: Readonly<Record<AccountBankFilter, string>> = {
  to_export: 'à exporter',
  in_flight: 'en attente de la banque',
  known: 'connus de la banque',
};

export function filterOf(row: AccountBankRowView): AccountBankFilter | null {
  switch (row.standing.kind) {
    case 'to_export':
    case 'in_flight':
      return row.standing.kind;
    case 'imported':
    case 'declared':
      return 'known';
    case 'excluded':
      return null;
  }
}
