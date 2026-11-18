import type { ChorusDepositStatusView } from '@lfd/contracts';

import { day } from './invoice-dossier-format';

/**
 * **L'échéance d'une facture, telle que le back-office la dit** (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 quinquies, T3′). Pour une facture d'organisme public, `dueOn` n'est que
 * l'échéance imprimée, au plus tôt : le délai part du dépôt sur Chorus. On
 * dit donc l'échéance effective, ou pourquoi il n'y en a pas.
 */
export function chorusDueNotice(chorus: ChorusDepositStatusView | null | undefined): string | null {
  switch (chorus?.state) {
    case 'to_deposit':
      return 'En attente de dépôt sur Chorus';
    case 'rejected':
      return 'Rejetée par Chorus';
    default:
      return null;
  }
}

/** Le jour qui juge le règlement : l'échéance effective d'une facture publique, `dueOn` sinon. */
export function payableDueOn(
  dueOn: string | null,
  chorus: ChorusDepositStatusView | null | undefined,
): string | null {
  return chorus ? chorus.effectiveDueOn : dueOn;
}

/** Une cellule « Échéance » : le jour, ou l'état Chorus qui en tient lieu. */
export function dueCell(
  dueOn: string | null,
  chorus: ChorusDepositStatusView | null | undefined,
): string {
  const notice = chorusDueNotice(chorus);
  if (notice !== null) {
    return notice;
  }
  const due = payableDueOn(dueOn, chorus);
  return due === null ? '—' : day(due);
}

/** Dans une phrase : « échéance le 3 oct. 2026 », l'état Chorus, ou rien. */
export function dueClause(
  dueOn: string | null,
  chorus: ChorusDepositStatusView | null | undefined,
): string | null {
  const notice = chorusDueNotice(chorus);
  if (notice !== null) {
    return notice.charAt(0).toLowerCase() + notice.slice(1);
  }
  const due = payableDueOn(dueOn, chorus);
  return due === null ? null : `échéance le ${day(due)}`;
}
