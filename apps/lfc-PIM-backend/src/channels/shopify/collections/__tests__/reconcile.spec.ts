import type {
  DesiredCollection,
  ShopifyCollection,
} from '../../shared/collection-types.js';
import { missingCollections, reconcileCollections } from '../reconcile.js';

const collection = (handle: string, productCount = 0): ShopifyCollection => ({
  id: `gid://shopify/Collection/${handle}`,
  handle,
  title: handle.toUpperCase(),
  productCount,
});

const want = (handle: string): DesiredCollection => ({
  handle,
  title: handle.toUpperCase(),
});

describe('reconcileCollections', () => {
  it('marque présente une désirée déjà sur la boutique, et rapproche la distante', () => {
    const { rows } = reconcileCollections(
      [want('tva-5-5')],
      [collection('tva-5-5', 42)],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.present).toBe(true);
    expect(rows[0]?.remote?.productCount).toBe(42);
  });

  it('marque manquante une désirée absente et la compte', () => {
    const result = reconcileCollections([want('tva-20')], []);
    expect(result.rows[0]?.present).toBe(false);
    expect(result.rows[0]?.remote).toBeNull();
    expect(result.missingCount).toBe(1);
  });

  it('repère une orpheline `tva-*` que plus aucune désirée ne réclame', () => {
    const { orphans } = reconcileCollections(
      [want('tva-5-5')],
      [collection('tva-5-5'), collection('tva-8-5')],
    );
    expect(orphans.map((o) => o.handle)).toEqual(['tva-8-5']);
  });

  it('ignore les collections hors périmètre TVA (autre préfixe)', () => {
    const { orphans } = reconcileCollections(
      [],
      [collection('promo-ete'), collection('tva-8-5')],
    );
    expect(orphans.map((o) => o.handle)).toEqual(['tva-8-5']);
  });

  it('missingCollections ne renvoie que les désirées absentes', () => {
    const reconciliation = reconcileCollections(
      [want('tva-5-5'), want('tva-20')],
      [collection('tva-5-5')],
    );
    expect(missingCollections(reconciliation)).toEqual([
      { handle: 'tva-20', title: 'TVA-20' },
    ]);
  });
});
