import { describe, expect, it } from 'vitest';

import { clienteleBadgeOf, clienteleLabel, methodLabel } from './order-identity';

describe('order-identity — les mots partagés d’une commande', () => {
  it('Pro en `info`, Particulier en `neutral`', () => {
    expect(clienteleBadgeOf('pro')).toEqual({ label: 'Pro', variant: 'info' });
    expect(clienteleBadgeOf('public')).toEqual({ label: 'Particulier', variant: 'neutral' });
  });

  it('🔴 une commande d’avant la distinction n’a ni badge ni libellé', () => {
    expect(clienteleBadgeOf(null)).toBeNull();
    expect(clienteleBadgeOf(undefined)).toBeNull();
    expect(clienteleLabel(null)).toBeNull();
  });

  it('le mode se dit Retrait / Livraison', () => {
    expect(methodLabel('pickup')).toBe('Retrait');
    expect(methodLabel('delivery')).toBe('Livraison');
  });
});
