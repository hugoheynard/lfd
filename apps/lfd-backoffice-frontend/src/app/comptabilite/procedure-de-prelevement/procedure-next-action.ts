import type { CollectionProcedureRowView } from '@lfd/contracts';

import { day } from '../invoice-dossier-format';
import { deadlineMissed, nothingToCollect, procedureRowTitle } from './procedure-list-wording';

/**
 * **Ce qu'il faut faire maintenant**, en tête de la table des procédures :
 * la ligne la plus urgente et son geste, pour ne pas avoir à lire huit
 * colonnes. Rien n'y est décidé : l'étape, la limite et la phase viennent du
 * serveur ; on choisit seulement laquelle dire d'abord.
 */
export interface ProcedureNextAction {
  /** La ligne à ouvrir ; `null` quand il n'y a rien à faire. */
  readonly row: CollectionProcedureRowView | null;
  readonly text: string;
  readonly tone: 'alert' | 'warning' | 'neutral';
}

/** Le geste de l'étape en cours ; `null` quand l'étape attend la banque. */
function gestureOf(row: CollectionProcedureRowView): string | null {
  switch (row.stage) {
    case 'accounts':
      return 'Exporter les comptes à la banque';
    case 'mandates':
      return 'Importer les mandats à la banque';
    case 'invoices':
      return 'Émettre les factures';
    case 'file':
      if (row.signatureToAttest) {
        return 'Attester la remise signée';
      }
      return row.deposited
        ? null
        : row.batches.length === 0
          ? 'Préparer le fichier'
          : 'Déposer le fichier';
    case 'returns':
      return row.warnings.some((warning) => warning.code === 'pending_returns')
        ? 'Traiter les retours de la banque'
        : null;
    case 'closed':
      return null;
  }
}

/** « avant le … à … », ou rien si la limite ne compte plus (fichier déposé) ou n'est pas réglée. */
function deadlineSuffix(row: CollectionProcedureRowView): string {
  const deadline = row.depositDeadline;
  if (deadline === null || row.deposited) {
    return '';
  }
  return ` avant le ${day(deadline.day)} à ${deadline.time}`;
}

/** Le rang d'urgence : limite la plus proche d'abord, sans limite ensuite. */
function urgency(row: CollectionProcedureRowView): string {
  const deadline = row.depositDeadline;
  return deadline === null ? '9999-12-31T23:59' : `${deadline.day}T${deadline.time}`;
}

/** Le jour de la prochaine clôture à venir, ou `null`. */
function nextClosureDay(rows: readonly CollectionProcedureRowView[]): string | null {
  const days = rows.filter((row) => row.phase === 'upcoming').map((row) => row.closureDay);
  return days.length === 0 ? null : days.reduce((min, current) => (current < min ? current : min));
}

/**
 * La ligne à traiter d'abord : une clôture manquée, sinon la procédure
 * ouverte dont la limite est la plus proche et qui attend un geste de nous.
 */
export function nextActionOf(rows: readonly CollectionProcedureRowView[]): ProcedureNextAction {
  const missed = rows.find((row) => row.phase === 'missed');
  if (missed !== undefined) {
    return {
      row: missed,
      text: `${procedureRowTitle(missed)} n’a jamais été préparée : préparer la dernière clôture, qui reprend ses commandes.`,
      tone: 'alert',
    };
  }
  const actionable = rows
    .filter((row) => row.phase === 'open' && !nothingToCollect(row) && gestureOf(row) !== null)
    .sort((a, b) => urgency(a).localeCompare(urgency(b)));
  const first = actionable[0];
  if (first !== undefined) {
    const late = deadlineMissed(first);
    const lateNote = late ? ' — la limite est dépassée' : '';
    return {
      row: first,
      text: `${gestureOf(first) ?? ''}${deadlineSuffix(first)} — ${procedureRowTitle(first)}${lateNote}.`,
      tone: late ? 'alert' : 'warning',
    };
  }
  const next = nextClosureDay(rows);
  return {
    row: null,
    text:
      next === null
        ? 'Rien à faire pour l’instant.'
        : `Rien à faire pour l’instant. Prochaine clôture le ${day(next)}.`,
    tone: 'neutral',
  };
}
