import type { GeneralDiscountView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  discountArticlesOf,
  discountBpFor,
  discountedArticles,
  discountedMillicents,
  flooredNames,
} from '../general-discount-pricing';
import { ARTICLES, CATEGORIES, HUGO } from './general-discount-fixture';

/**
 * **Ce que la remise fait aux prix** (`la-remise-generale.md`, « Un taux par
 * famille ») : la ligne la plus précise gagne, le prix ferme passe devant, et
 * le prix remisé est celui de la caisse.
 */

function bpOf(sku: string, view: GeneralDiscountView = HUGO): number | null {
  const article = ARTICLES.find((entry) => entry.sku === sku)!;
  return discountBpFor(view, article);
}

describe('la ligne la plus précise gagne', () => {
  it('déclinaison, puis famille la plus proche, puis le taux de base', () => {
    expect(bpOf('BAG')).toBe(3500);
    expect(bpOf('PAV')).toBe(4000);
    expect(bpOf('SEI')).toBe(2500);
    expect(bpOf('TAB')).toBeNull();
  });

  it('en « Seulement… », rien hors des lignes à taux', () => {
    const only: GeneralDiscountView = {
      mode: 'only',
      baseBp: null,
      rules: [{ target: 'category', targetId: 'pain', bp: 4000 }],
    };
    expect(bpOf('PAV', only)).toBe(4000);
    expect(bpOf('TAB', only)).toBeNull();
  });

  it('sans chemin de parentes, lit la famille directe', () => {
    const [article] = discountArticlesOf([
      { ...CATEGORIES[2]!, family: { id: 'choco', name: 'Chocolat', position: 3 } },
    ]);
    expect(article!.categoryPath).toEqual(['choco']);
  });
});

describe('le prix remisé', () => {
  it('est exact, arrondi une seule fois au plus proche', () => {
    expect(discountedMillicents(200_000, 3000)).toBe(140_000);
    // 123 457 × 0,7 = 86 419,9 → 86 420.
    expect(discountedMillicents(123_457, 3000)).toBe(86_420);
  });

  it('🔴 le prix ferme l’emporte : l’article n’est pas remisé', () => {
    const result = discountedArticles(HUGO, ARTICLES, new Set(['PAV']));
    expect(result.has('PAV')).toBe(false);
    expect(result.get('SEI')?.discountedMillicents).toBe(150_000);
  });

  it('Q3 : relève à la limite, et le nomme', () => {
    const view: GeneralDiscountView = { mode: 'all_except', baseBp: 3000, rules: [] };
    const result = discountedArticles(view, ARTICLES, new Set());
    expect(result.get('TAB')).toEqual({
      bp: 3000,
      discountedMillicents: 70_000,
      finalMillicents: 90_000,
      floored: true,
    });
    expect(flooredNames(result, ARTICLES)).toEqual(['Nom TAB']);
  });
});
