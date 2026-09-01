import { describe, expect, it } from 'vitest';
import type { ProductStatus } from '@lfd/pim-contracts';

import { productStatusLabel, productStatusVariant } from '../product-status';

const ALL: readonly ProductStatus[] = ['draft', 'published', 'archived'];

describe('la façon dont un statut de produit se montre', () => {
  it('rend un libellé en FRANÇAIS pour chaque état', () => {
    expect(ALL.map((status) => productStatusLabel(status))).toEqual([
      'Brouillon',
      'Publié',
      'Archivé',
    ]);
  });

  /**
   * Régression : la liste produits peignait `[content]="p.status"` — la valeur
   * d'enum brute — et personne ne la voyait, `lint:code-language` ne lisant pas
   * les valeurs interpolées dans un gabarit (audit 2026-09-01, §9).
   */
  it('ne laisse passer aucune valeur d’enum telle quelle', () => {
    for (const status of ALL) {
      expect(productStatusLabel(status)).not.toBe(status);
    }
  });

  /**
   * Régression : la variante se calculait `status === 'archived' ? 'neutral' :
   * 'success'`. Un brouillon s'affichait donc en VERT, comme un produit en
   * ligne — la colonne ne distinguait pas les deux états qu'elle existe pour
   * distinguer.
   */
  it('ne donne le vert qu’à ce qui est réellement en vente', () => {
    expect(productStatusVariant('published')).toBe('success');
    expect(productStatusVariant('draft')).not.toBe('success');
    expect(productStatusVariant('archived')).not.toBe('success');
  });

  it('donne une teinte DIFFÉRENTE à chacun des trois états', () => {
    const variants = ALL.map((status) => productStatusVariant(status));
    expect(new Set(variants).size).toBe(ALL.length);
  });
});
