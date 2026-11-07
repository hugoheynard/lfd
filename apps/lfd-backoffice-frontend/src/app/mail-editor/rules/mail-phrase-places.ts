import {
  MODEL_SECTION_LABELS,
  type MailDocument,
  type MailEditorPhrasePlace,
  type MailEditorPhraseView,
} from '@lfd/mail-blocks';

import { FRAME_LABELS, textHeading } from './mail-sections';

/** Les deux cadres, dans l'ordre où l'e-mail les montre — avant les blocs. */
export const MAIL_FRAMES = ['subject', 'header'] as const;

/** Deux places désignent le même bloc, ou le même cadre. */
export function samePlace(
  a: MailEditorPhrasePlace | null,
  b: MailEditorPhrasePlace | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  if (a.kind === 'block') {
    return b.kind === 'block' && a.block === b.block;
  }
  return b.kind === 'frame' && a.frame === b.frame;
}

/** Les phrases rangées à cette place par le serveur (`MailEditorPhraseView.place`), dans son ordre. */
export function phrasesAt(
  phrases: readonly MailEditorPhraseView[],
  place: MailEditorPhrasePlace,
): readonly MailEditorPhraseView[] {
  return phrases.filter((phrase) => samePlace(phrase.place, place));
}

/**
 * Les phrases qu'aucun cadre ni bloc À L'ÉCRAN ne montre : hors carte
 * (`place: null`, un `alt` d'image), ou rangées sous un bloc du modèle que le
 * document n'a pas — sans quoi elles ne seraient atteignables nulle part.
 */
export function unplacedPhrases(
  phrases: readonly MailEditorPhraseView[],
  document: MailDocument,
): readonly MailEditorPhraseView[] {
  const shown = new Set(
    document.blocks.flatMap((block) => (block.kind === 'model' ? [block.section] : [])),
  );
  return phrases.filter(
    (phrase) =>
      phrase.place === null || (phrase.place.kind === 'block' && !shown.has(phrase.place.block)),
  );
}

/** Le nom d'une place, tel que l'équipe le lit. */
export function placeTitle(place: MailEditorPhrasePlace): string {
  return place.kind === 'block' ? MODEL_SECTION_LABELS[place.block] : FRAME_LABELS[place.frame];
}

/**
 * Le nom d'une phrase sous sa place : la règle de l'écran des textes
 * (`textHeading`) — sa variante, rien si elle est seule, sinon son chemin.
 */
export function phraseHeading(phrase: MailEditorPhraseView, siblings: number): string | null {
  return textHeading(phrase, siblings);
}
