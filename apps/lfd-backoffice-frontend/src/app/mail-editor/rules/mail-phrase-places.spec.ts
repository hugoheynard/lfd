import type {
  MailDocument,
  MailEditorPhraseLocaleView,
  MailEditorPhrasePlace,
  MailEditorPhraseView,
} from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import {
  phraseHeading,
  phrasesAt,
  placeTitle,
  samePlace,
  unplacedPhrases,
} from './mail-phrase-places';

const LOCALE: MailEditorPhraseLocaleView = {
  default: 'Texte',
  draftState: 'unchanged',
  draftText: null,
  publishedText: null,
  revision: 0,
  defaultChangedSince: null,
};

function phrase(
  path: string,
  place: MailEditorPhrasePlace | null,
  variant: string | null = null,
): MailEditorPhraseView {
  return {
    path,
    variables: [],
    requiredVariables: [],
    place,
    variant,
    staleTranslations: [],
    locales: { fr: LOCALE, en: LOCALE, it: LOCALE },
  };
}

const TITLE: MailEditorPhrasePlace = { kind: 'block', block: 'title' };
const SUBJECT: MailEditorPhrasePlace = { kind: 'frame', frame: 'subject' };

const DOCUMENT: MailDocument = {
  template: 'customer.order-placed',
  blocks: [{ id: 'b1', kind: 'model', section: 'title' }],
};

describe('mail-phrase-places', () => {
  it('distingue un bloc d’un cadre, et deux blocs entre eux', () => {
    expect(samePlace(TITLE, { kind: 'block', block: 'title' })).toBe(true);
    expect(samePlace(TITLE, { kind: 'block', block: 'body' })).toBe(false);
    expect(samePlace(TITLE, SUBJECT)).toBe(false);
    expect(samePlace(SUBJECT, { kind: 'frame', frame: 'header' })).toBe(false);
    expect(samePlace(null, null)).toBe(true);
    expect(samePlace(null, TITLE)).toBe(false);
  });

  it('range les phrases sous leur place, dans l’ordre du serveur', () => {
    const phrases = [
      phrase('title.paid', TITLE, 'Commande payée par carte'),
      phrase('subject', SUBJECT),
      phrase('title.pending', TITLE, 'En attente'),
    ];
    expect(phrasesAt(phrases, TITLE).map((p) => p.path)).toEqual(['title.paid', 'title.pending']);
    expect(phrasesAt(phrases, SUBJECT).map((p) => p.path)).toEqual(['subject']);
  });

  it('garde atteignables les phrases hors carte et celles d’un bloc absent du document', () => {
    const phrases = [
      phrase('title.paid', TITLE),
      phrase('image.alt', null),
      phrase('summary.total', { kind: 'block', block: 'summary' }),
      phrase('subject', SUBJECT),
    ];
    expect(unplacedPhrases(phrases, DOCUMENT).map((p) => p.path)).toEqual([
      'image.alt',
      'summary.total',
    ]);
  });

  it('nomme une place et une phrase comme l’écran des textes', () => {
    expect(placeTitle(TITLE)).toBe('Titre');
    expect(placeTitle(SUBJECT)).toBe('Objet');
    expect(phraseHeading(phrase('title.paid', TITLE, 'Payée par carte'), 2)).toBe(
      'Payée par carte',
    );
    expect(phraseHeading(phrase('subject', SUBJECT), 1)).toBeNull();
  });
});
