import {
  DEFAULT_CONTACT_SETTINGS,
  type ContactPhoneView,
  type ContactSettingsPayload,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { draftIssue, previewOf, trimmedPayload } from './contact-card-draft';

const text = (fr: string, en = '') => ({ fr, en, it: '' });
const PHONE: ContactPhoneView = {
  id: 'p1',
  label: text('Boutique'),
  number: '04 79 11 22 33',
  audience: 'both',
  position: 0,
  active: true,
};

function withB2c(b2c: Partial<ContactSettingsPayload['cards']['b2c']>): ContactSettingsPayload {
  return {
    cards: {
      ...DEFAULT_CONTACT_SETTINGS.cards,
      b2c: { ...DEFAULT_CONTACT_SETTINGS.cards.b2c, ...b2c },
    },
  };
}

describe('previewOf — la carte selon ses deux interrupteurs (Hugo, 2026-10-26)', () => {
  it('numéro et formulaire : les boutons aux mots de la boutique, sans message', () => {
    expect(
      previewOf(withB2c({ noContactMessage: text('Bientôt') }), [PHONE], 'b2c', 'fr'),
    ).toMatchObject({
      calls: ['Appeler · Boutique · 04 79 11 22 33'],
      write: 'Écrire',
      noContact: '',
    });
  });

  it('les mots réglés des boutons l’emportent, langue puis français', () => {
    const draft = withB2c({ callLabel: text('Nous appeler'), writeLabel: text('', 'Email us') });
    expect(previewOf(draft, [PHONE], 'b2c', 'en')).toMatchObject({
      calls: ['Nous appeler · Boutique · 04 79 11 22 33'],
      write: 'Email us',
    });
  });

  it('numéro coupé : aucun « Appeler », même avec un numéro réglé', () => {
    expect(previewOf(withB2c({ showPhone: false }), [PHONE], 'b2c', 'fr')).toMatchObject({
      calls: [],
      write: 'Écrire',
      noContact: '',
    });
  });

  it('ni numéro ni formulaire : le message, en anglais si écrit, sinon en français', () => {
    const draft = withB2c({
      showPhone: false,
      showForm: false,
      noContactMessage: text('Bientôt', 'Soon'),
    });
    expect(previewOf(draft, [PHONE], 'b2c', 'en')).toMatchObject({
      calls: [],
      write: '',
      noContact: 'Soon',
    });
    expect(previewOf(draft, [PHONE], 'b2c', 'it').noContact).toBe('Bientôt');
  });
});

describe('draftIssue', () => {
  it('rien à redire sur le réglage par défaut', () => {
    expect(draftIssue(DEFAULT_CONTACT_SETTINGS)).toBe('');
  });

  it('refuse une carte sans numéro ni formulaire qui ne dit rien, en la nommant', () => {
    expect(draftIssue(withB2c({ showPhone: false, showForm: false }))).toContain(
      'Carte particuliers : une carte sans numéro ni formulaire doit dire quelque chose',
    );
  });

  it('refuse un mot de bouton trop long', () => {
    expect(draftIssue(withB2c({ writeLabel: text('x'.repeat(41)) }))).toContain(
      'Bouton d’écriture trop long (40 caractères au plus)',
    );
  });
});

describe('trimmedPayload', () => {
  it('rogne chaque texte et garde les interrupteurs', () => {
    expect(
      trimmedPayload(withB2c({ showForm: false, noContactMessage: text(' Bientôt ') })).cards.b2c,
    ).toMatchObject({ showPhone: true, showForm: false, noContactMessage: text('Bientôt') });
  });
});
