import type { PublicContactSettingsView } from '@lfd/contracts/shop-values';
import { describe, expect, it } from 'vitest';

import { CONTACT_CARD_DEFAULTS } from '@lfd/contracts/shop-values';
import { NO_CONTACT_SETTINGS, phonesFor } from './contact-settings.store';

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

  it('aucun numéro réglé → le seul numéro de repli', () => {
    expect(phonesFor(NO_CONTACT_SETTINGS, 'b2c', 'fr')).toEqual([
      { label: '', number: CONTACT_CARD_DEFAULTS.phone },
    ]);
  });
});
