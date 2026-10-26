import type { PublicContactSettingsView } from '@lfd/contracts/shop-values';
import { describe, expect, it } from 'vitest';

import { contactFor, NO_CONTACT_SETTINGS, phonesFor } from './contact-settings.store';

const label = (fr: string, en = '') => ({ fr, en, it: '' });

const SETTINGS: PublicContactSettingsView = {
  ...NO_CONTACT_SETTINGS,
  phones: [
    { label: label('Service commercial', 'Sales'), number: '04 79 00 00 01', audience: 'b2b' },
    { label: label('Boutique'), number: '04 79 00 00 02', audience: 'both' },
    { label: label('Particuliers'), number: '04 79 00 00 03', audience: 'b2c' },
  ],
};

describe('phonesFor', () => {
  it('garde `both` et le public de l’écran, dans l’ordre, libellé dans la langue (fr à défaut)', () => {
    expect(phonesFor(SETTINGS, 'b2b', 'en')).toEqual([
      { label: 'Sales', number: '04 79 00 00 01' },
      { label: 'Boutique', number: '04 79 00 00 02' },
    ]);
  });

  /**
   * Régression : aucun numéro réglé faisait afficher un numéro de repli
   * inventé, en production (retiré le 2026-10-26, décision de Hugo).
   */
  it('aucun numéro réglé → aucun numéro, jamais un repli', () => {
    expect(phonesFor(NO_CONTACT_SETTINGS, 'b2c', 'fr')).toEqual([]);
  });

  it('seuls les numéros de l’autre public → aucun numéro', () => {
    expect(
      phonesFor({ ...NO_CONTACT_SETTINGS, phones: [SETTINGS.phones[0]!] }, 'b2c', 'fr'),
    ).toEqual([]);
  });
});

describe('contactFor — la carte selon ses deux interrupteurs (Hugo, 2026-10-26)', () => {
  const WORDS = { call: 'Appeler', write: 'Écrire' };
  const withB2c = (
    b2c: Partial<PublicContactSettingsView['cards']['b2c']>,
  ): PublicContactSettingsView => ({
    ...SETTINGS,
    cards: { ...SETTINGS.cards, b2c: { ...SETTINGS.cards.b2c, ...b2c } },
  });
  const SOON = { fr: 'Nous vous contacterons bientôt', en: 'We will contact you soon', it: '' };

  it('numéro et formulaire : les deux, aux mots du dictionnaire, sans message', () => {
    expect(contactFor(withB2c({ noContactMessage: SOON }), 'b2c', 'fr', WORDS)).toEqual({
      phones: [
        { label: 'Boutique', number: '04 79 00 00 02' },
        { label: 'Particuliers', number: '04 79 00 00 03' },
      ],
      call: 'Appeler',
      write: 'Écrire',
      canWrite: true,
      noContact: '',
    });
  });

  it('numéro coupé, formulaire affiché : aucun numéro, « Écrire » reste', () => {
    const shown = contactFor(withB2c({ showPhone: false }), 'b2c', 'fr', WORDS);
    expect(shown).toMatchObject({ phones: [], canWrite: true, noContact: '' });
  });

  it('ni numéro ni formulaire : le message réglé, dans la langue (fr à défaut)', () => {
    const silent = withB2c({ showPhone: false, showForm: false, noContactMessage: SOON });
    expect(contactFor(silent, 'b2c', 'en', WORDS)).toMatchObject({
      phones: [],
      canWrite: false,
      noContact: 'We will contact you soon',
    });
    expect(contactFor(silent, 'b2c', 'it', WORDS).noContact).toBe('Nous vous contacterons bientôt');
  });

  it('les mots des boutons réglés l’emportent sur le dictionnaire', () => {
    const shown = contactFor(
      withB2c({
        callLabel: { fr: 'Nous appeler', en: '', it: '' },
        writeLabel: { fr: '', en: 'Email us', it: '' },
      }),
      'b2c',
      'en',
      WORDS,
    );
    expect(shown).toMatchObject({ call: 'Nous appeler', write: 'Email us' });
  });
});
