import type { MediaCarrierView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { carrierPath, carrierWord } from './carrier-destinations';

const carrier = (kind: MediaCarrierView['kind'], id: string): MediaCarrierView => ({
  kind,
  id,
  label: 'x',
});

describe('où mène un porteur', () => {
  it('nomme chaque sorte de porteur', () => {
    expect(carrierWord(carrier('product', 'p1'))).toBe('Fiche');
    expect(carrierWord(carrier('category', 'c1'))).toBe('Famille');
    expect(carrierWord(carrier('storefront', 'v'))).toBe('Vitrine');
    expect(carrierWord(carrier('operation', 'noel'))).toBe('Opération');
  });

  it('mène aux fiches et aux familles du référentiel, et à la vitrine sans identifiant', () => {
    expect(carrierPath(carrier('product', 'p1'))).toEqual(['/pim', 'produits', 'p1']);
    expect(carrierPath(carrier('category', 'c1'))).toEqual(['/pim', 'categories', 'c1']);
    expect(carrierPath(carrier('storefront', 'v'))).toEqual(['/vitrine']);
    expect(carrierPath(carrier('operation', 'noel'))).toEqual(['/operations', 'noel']);
  });
});
