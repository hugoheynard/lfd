import type {
  CollectionProcedureRowView,
  CollectionProcedureStageView,
  CollectionProcedureWarningView,
} from '@lfd/contracts';
import type { FoldBadgeVariant, FoldTableTone } from 'fold-ng';

import { day } from '../invoice-dossier-format';
import { rhythmsLabel } from './procedure-wording';

/**
 * Les mots de la **table des procédures de prélèvement** (plan
 * `plan-page-procedure-de-prelevement.md`, § 11). Rien n'y est calculé : la
 * phase, l'étape et les avertissements viennent du serveur ; on les dit.
 */

/** L'arrivée de la page ; le détail d'une procédure est sous `/<id>`. */
export const PROCEDURE_LIST_ROUTE = '/comptabilite/procedure-de-prelevement';

const STAGE_LABELS: Readonly<Record<CollectionProcedureStageView, string>> = {
  accounts: '1 Comptes',
  mandates: '2 Mandats',
  file: '3 Fichier',
  returns: '4 Retours',
  closed: 'Close',
};

/** L'étape, « Manquée » pour une clôture jamais préparée, et « à venir » avant la clôture. */
export function stageLabel(row: CollectionProcedureRowView): string {
  if (row.phase === 'missed') {
    return 'Manquée';
  }
  const label = STAGE_LABELS[row.stage];
  return row.phase === 'upcoming' ? `${label} · à venir` : label;
}

/** Le ton du badge d'étape : manquée, à faire, à venir, close. */
export function stageVariant(row: CollectionProcedureRowView): FoldBadgeVariant {
  if (row.phase === 'missed') {
    return 'alert';
  }
  if (row.phase === 'closed') {
    return 'success';
  }
  return row.phase === 'upcoming' ? 'neutral' : 'accent';
}

/**
 * Le fichier d'un lot de la ligne a été rejeté par la banque, et aucun lot
 * vivant ne l'a remplacé : la ligne invite à préparer de nouveau.
 */
export function rejectedByBankLabel(row: CollectionProcedureRowView): string | null {
  const rejected = row.batches.some((batch) => batch.status === 'rejected_by_bank');
  const live = row.batches.some(
    (batch) => batch.status === 'constituted' || batch.status === 'deposited',
  );
  return rejected && !live ? 'Rejeté par la banque — préparer de nouveau' : null;
}

/** « Mensuel · période du 1er au 31 octobre 2026 » — comme le titre du détail. */
export function procedureRowTitle(row: CollectionProcedureRowView): string {
  const rhythms = rhythmsLabel(row.modes);
  const period = `période ${row.periodLabel}`;
  return rhythms === '' ? period : `${rhythms} · ${period}`;
}

/** « 12 nov. 2026 à 13:45 », ou la limite à régler. */
export function rowDeadlineLabel(row: CollectionProcedureRowView): string {
  const deadline = row.depositDeadline;
  return deadline === null ? 'Non réglée' : `${day(deadline.day)} à ${deadline.time}`;
}

/** Le jour de la clôture : les factures de la période sont émises la veille. */
export function rowClosureLabel(row: CollectionProcedureRowView): string {
  return day(row.closureDay);
}

/** L'échéance, ou un tiret pour un lot d'avant l'échéance figée. */
export function rowCollectionLabel(row: CollectionProcedureRowView): string {
  return row.collectionDay === null ? '—' : day(row.collectionDay);
}

/** La limite est dépassée sans dépôt : la cellule se dit en rouge. */
export function deadlineMissed(row: CollectionProcedureRowView): boolean {
  return row.warnings.some((warning) => warning.code === 'deadline_passed');
}

/** La ligne entière prend le ton de son avertissement le plus grave. */
export function rowTone(row: CollectionProcedureRowView): FoldTableTone {
  if (row.phase === 'missed' || deadlineMissed(row)) {
    return 'alert';
  }
  return row.warnings.length > 0 ? 'warning' : null;
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count > 1 ? many : one}`;
}

/** Un avertissement en quelques mots. */
export function warningText(warning: CollectionProcedureWarningView): string {
  const count = warning.count ?? 0;
  switch (warning.code) {
    case 'deadline_passed':
      return 'Limite de dépôt dépassée';
    case 'deadline_not_set':
      return 'Limite de dépôt non réglée';
    case 'tight_deposit_margin':
      return count === 0
        ? 'Aucun jour ouvré avant la limite'
        : `${plural(count, 'jour ouvré', 'jours ouvrés')} avant la limite`;
    case 'accounts_to_export':
      return plural(count, 'compte à exporter', 'comptes à exporter');
    case 'mandates_to_export':
      return plural(count, 'mandat non importé', 'mandats non importés');
    case 'unmandated_debtors':
      return plural(count, 'débiteur sans mandat', 'débiteurs sans mandat');
    case 'pending_returns':
      return plural(count, 'retour en suspens', 'retours en suspens');
    case 'missed_closure':
      return 'Jamais préparée — préparer la dernière clôture, qui la reprend';
  }
}

/** Le ton d'un avertissement : une limite dépassée ou une clôture manquée est une alerte. */
export function warningVariant(warning: CollectionProcedureWarningView): FoldBadgeVariant {
  return warning.code === 'deadline_passed' || warning.code === 'missed_closure'
    ? 'alert'
    : 'warning';
}
