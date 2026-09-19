import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { said, text, type Phrase } from '../phrase';

/**
 * **Les gestes du staff sur les notes du commercial** — repris de
 * `factSentence` (plan des phrases, lot C, 2026-09-19).
 *
 * Le fait ne porte AUCUN contenu — ni titre, ni description, ni photo — et la
 * phrase n'en invente pas : une note supprimée définitivement ne doit rester
 * lisible nulle part, journal compris (plan « notes photo du commercial », D6).
 * Une action inconnue se dit en termes généraux plutôt que de disparaître.
 */
const CLIENT_NOTE_ACTIONS: Readonly<Record<string, string>> = {
  note_added: 'Note du commercial ajoutée',
  note_revised: 'Note du commercial modifiée',
  note_removed: 'Note du commercial supprimée définitivement',
  notes_reordered: 'Notes du commercial reclassées',
};

/**
 * Les types dont une charge hors schéma ne se rend PAS brute dans le détail :
 * leur schéma garantit qu'aucun contenu n'y entre, et une charge qui n'y
 * répondrait pas ne doit pas le faire entrer par l'écran.
 */
export const NO_RAW_DETAIL: ReadonlySet<string> = new Set<JournalFactType>([
  'company.client_note_edited_by_staff',
]);

export const ACCOUNTS_PHRASES = {
  'company.client_note_edited_by_staff': (fact) => {
    const action = fact.payload['action'];
    const sentence =
      (typeof action === 'string' ? CLIENT_NOTE_ACTIONS[action] : undefined) ??
      'Notes du commercial modifiées';
    return said([text(sentence)], ['action']);
  },
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
