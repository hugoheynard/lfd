import { describe, expect, it } from 'vitest';

import type { CartLine } from '../cart.store';
import { quoteKeyOf } from '../quote-key';

const line = (sku: string, quantity: number): CartLine => ({
  sku,
  name: `Produit ${sku}`,
  unitPriceMillicents: 200_000,
  quantity,
});

describe('quoteKeyOf', () => {
  it('rend la même clé pour le même panier dans un autre ordre', () => {
    // Le prix ne dépend pas de l'ordre de remplissage. Sans le tri, retirer puis
    // remettre un article redemanderait un devis identique.
    const key = quoteKeyOf('c_1', [line('VIE-001', 12), line('PAI-001', 6)]);

    expect(quoteKeyOf('c_1', [line('PAI-001', 6), line('VIE-001', 12)])).toBe(key);
  });

  it('change quand une quantité change', () => {
    const before = quoteKeyOf('c_1', [line('VIE-001', 12)]);

    expect(quoteKeyOf('c_1', [line('VIE-001', 24)])).not.toBe(before);
  });

  it('change quand le client change', () => {
    // La mercuriale vient du client : le même panier ne vaut pas le même prix.
    const key = quoteKeyOf('c_1', [line('VIE-001', 12)]);

    expect(quoteKeyOf('c_2', [line('VIE-001', 12)])).not.toBe(key);
  });

  it('ignore ce qui vient du catalogue et non du panier', () => {
    // Un libellé ou un tarif catalogue qui bouge ne change pas ce que le serveur
    // résout : l'inclure ferait redemander un devis pour rien.
    const key = quoteKeyOf('c_1', [line('VIE-001', 12)]);
    const renamed: CartLine = {
      sku: 'VIE-001',
      name: 'Croissant pur beurre',
      unitPriceMillicents: 999_000,
      quantity: 12,
    };

    expect(quoteKeyOf('c_1', [renamed])).toBe(key);
  });

  it('rend la clé vide pour un panier vide', () => {
    expect(quoteKeyOf('c_1', [])).toBe('');
  });
});
