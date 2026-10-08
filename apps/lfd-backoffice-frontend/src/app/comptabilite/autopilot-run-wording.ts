import type { CollectionAutopilotRunView, CollectionBatchView } from '@lfd/contracts';

import { batchMonthName, ofMonth } from './collection-month-wording';
import { instant } from './invoice-dossier-format';

/**
 * Les mots de la **dernière tentative de la préparation automatique** (plan
 * `documentation/comptabilite/prelevement/prelevement-automatique.md`, PA3), lus
 * par la fiche de l'entité et par l'écran du mois.
 *
 * Une tentative par mois, jamais deux : une issue qui n'a pas préparé de
 * lot dit donc toujours le geste de sortie — préparer le lot à la main.
 */

/** Le ton de l'encadré : un échec se voit, le reste s'énonce. */
export type AutopilotRunTone = 'success' | 'info' | 'warning';

export interface AutopilotRunSentence {
  readonly tone: AutopilotRunTone;
  /** La phrase, datée. */
  readonly said: string;
  /** Le message du serveur, tel quel ; `null` s'il n'y en a pas. */
  readonly detail: string | null;
}

/** Le mois tenté, nommé comme le lot : « lot de septembre ». */
function cycleOf(run: CollectionAutopilotRunView): string {
  return `lot ${ofMonth(batchMonthName(run.cycleClosesAt))}`;
}

/** La dernière tentative, en une phrase et un ton. */
export function autopilotRunSentence(run: CollectionAutopilotRunView): AutopilotRunSentence {
  const at = instant(run.ranAt);
  const cycle = cycleOf(run);
  switch (run.outcome) {
    case 'constituted':
      return {
        tone: 'success',
        said: `Lot préparé automatiquement le ${at} (${cycle}).`,
        detail: null,
      };
    case 'nothing_to_collect':
      return {
        tone: 'info',
        said: `Préparation automatique tentée le ${at} (${cycle}) : rien à prélever.`,
        detail: run.message,
      };
    case 'not_yet_open':
      return {
        tone: 'info',
        said: `Préparation automatique tentée le ${at} (${cycle}) : ce mois n’est pas encore prélevable.`,
        detail: run.message,
      };
    case 'failed':
      return {
        tone: 'warning',
        said: `La préparation automatique a échoué le ${at} (${cycle}). Elle ne réessaie pas : préparez le lot à la main, après avoir corrigé la cause.`,
        detail: run.message,
      };
    case 'pending':
      return {
        tone: 'warning',
        said: `Préparation automatique commencée le ${at} (${cycle}) sans issue écrite : elle s’est interrompue. Si aucun lot n’apparaît, préparez-le à la main.`,
        detail: null,
      };
  }
}

/** « préparé automatiquement » ou « préparé par la comptabilité » — jamais un nom. */
export function batchAuthorLabel(batch: CollectionBatchView): string {
  return batch.constitutedBy === 'system'
    ? 'Préparé automatiquement'
    : 'Préparé par la comptabilité';
}
