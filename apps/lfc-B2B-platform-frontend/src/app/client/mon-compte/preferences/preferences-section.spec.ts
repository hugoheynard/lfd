import { NO_FULFILLMENT_PREFERENCE } from '@lfd/contracts';

import { asRole, TOMMEUSES } from '../account.fixture';
import { canEditPreferences, samePreference } from './preferences-section';

describe('le réglage de l’habitude de service', () => {
  it('ne s’écrit qu’en owner/admin — les rôles que l’API laisse écrire', () => {
    expect(canEditPreferences(TOMMEUSES)).toBe(true);
    expect(canEditPreferences(asRole('admin'))).toBe(true);
    expect(canEditPreferences(asRole('orders'))).toBe(false);
    expect(canEditPreferences(asRole('billing'))).toBe(false);
    expect(canEditPreferences(null)).toBe(false);
  });

  it('compare les quatre champs, socle de signature compris', () => {
    const base = NO_FULFILLMENT_PREFERENCE;
    expect(samePreference(base, { ...base })).toBe(true);
    expect(samePreference(base, { ...base, method: 'pickup' })).toBe(false);
    expect(samePreference(base, { ...base, pickupAddressId: 'pk_1' })).toBe(false);
    expect(samePreference(base, { ...base, deliveryAddressId: 'adr_1' })).toBe(false);
    expect(samePreference(base, { ...base, signatureRequired: true })).toBe(false);
  });
});
