import { describe, expect, it } from 'vitest';

import { mailLocaleView, mailTextView } from '../mail-copy.testing';
import {
  canResetTo,
  defaultChangedIn,
  insertVariable,
  pendingIn,
  stateOf,
  upcomingText,
} from './mail-text';

describe('upcomingText — ce que l’e-mail dira après « Publier »', () => {
  it('le brouillon, le code s’il est rétabli, sinon le publié, sinon le code', () => {
    expect(upcomingText(mailLocaleView('A', { draftState: 'set', draftText: 'B' }))).toBe('B');
    expect(upcomingText(mailLocaleView('A', { draftState: 'reset', publishedText: 'C' }))).toBe(
      'A',
    );
    expect(upcomingText(mailLocaleView('A', { publishedText: 'C' }))).toBe('C');
    expect(upcomingText(mailLocaleView('A'))).toBe('A');
  });
});

describe('stateOf et canResetTo', () => {
  it('dit « Brouillon » dès qu’une frappe attend, « Publié » pour un remplacement servi', () => {
    expect(stateOf(mailLocaleView('A'), 'A')).toBeNull();
    expect(stateOf(mailLocaleView('A'), 'AB')?.label).toBe('Brouillon');
    expect(stateOf(mailLocaleView('A', { publishedText: 'C' }), 'C')?.label).toBe('Publié');
  });

  it('n’offre « Rétablir » que s’il y a quelque chose à défaire', () => {
    expect(canResetTo(mailLocaleView('A'), 'A')).toBe(false);
    expect(canResetTo(mailLocaleView('A'), 'B')).toBe(true);
    expect(canResetTo(mailLocaleView('A', { publishedText: 'C' }), 'C')).toBe(true);
  });
});

describe('pendingIn', () => {
  it('compte les langues qui attendent « Publier »', () => {
    const text = mailTextView('m', 'subject', 'A', {
      locales: { fr: { draftState: 'set', draftText: 'B' }, it: { draftState: 'reset' } },
    });
    expect(pendingIn([text, mailTextView('m', 'title', 'T')])).toBe(2);
  });
});

describe('insertVariable — au curseur', () => {
  it('remplace la sélection et place le curseur après la variable', () => {
    expect(insertVariable('Commande  reçue', 'ref', 9, 9)).toEqual({
      text: 'Commande {ref} reçue',
      caret: 14,
    });
    expect(insertVariable('Bonjour XX', 'name', 8, 10).text).toBe('Bonjour {name}');
  });

  it('borne une position hors du texte', () => {
    expect(insertVariable('A', 'n', 99, 99)).toEqual({ text: 'A{n}', caret: 4 });
  });
});

describe('defaultChangedIn', () => {
  it('compte les langues qui portent le signal, et elles seules', () => {
    const drift = { defaultChangedSince: { previousDefault: 'Avant' } };
    expect(
      defaultChangedIn([
        mailTextView('m', 'a', 'A', { locales: { fr: drift, it: drift } }),
        mailTextView('m', 'b', 'B'),
      ]),
    ).toBe(2);
  });
});
