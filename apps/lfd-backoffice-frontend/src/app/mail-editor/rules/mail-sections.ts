import type { MailSectionTextView } from '@lfd/contracts';

import { pathLabel } from './mail-labels';

/** Les deux cadres immobiles d'un e-mail (E4, S2) : l'objet et l'en-tête. */
export type MailFrame = 'subject' | 'header';

export const FRAME_LABELS: Readonly<Record<MailFrame, string>> = {
  subject: 'Objet',
  header: 'En-tête',
};

/**
 * Le nom d'un texte dans sa carte (S6) : sa variante — QUAND il s'affiche —
 * s'il en a une ; seul dans sa carte, aucun (le titre de la carte suffit) ;
 * sinon le nom de son chemin.
 */
export function textHeading(text: MailSectionTextView, siblings: number): string | null {
  if (text.variant !== null) {
    return text.variant;
  }
  return siblings > 1 ? pathLabel(text.path) : null;
}
