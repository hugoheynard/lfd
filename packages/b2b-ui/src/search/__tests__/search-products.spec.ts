import {
  damerauLevenshtein,
  normalizeSearchText,
  searchProducts,
  typoBudget,
  type ProductSearchKeys,
} from '../search-products';

interface Item {
  readonly sku: string;
  readonly name: string;
  readonly family?: string;
}

const KEYS: ProductSearchKeys<Item> = {
  nameOf: (item) => item.name,
  skuOf: (item) => item.sku,
  extraOf: (item) => item.family ?? '',
};

const CROISSANT: Item = { sku: 'VIE-001', name: 'Croissant', family: 'Viennoiseries' };
const PAIN_CHOC: Item = { sku: 'VIE-002', name: 'Pain au chocolat', family: 'Viennoiseries' };
const BAGUETTE: Item = { sku: 'PAI-001', name: 'Baguette tradition', family: 'Pains' };
const ECLAIR: Item = { sku: 'PAT-010', name: 'Éclair café', family: 'Pâtisseries' };
const CHAUSSON: Item = { sku: 'VIE-003', name: 'Chausson aux pommes', family: 'Viennoiseries' };
const ALL: readonly Item[] = [CROISSANT, PAIN_CHOC, BAGUETTE, ECLAIR, CHAUSSON];

const names = (query: string, items: readonly Item[] = ALL): readonly string[] =>
  searchProducts(items, query, KEYS).map((item) => item.name);

describe('normalizeSearchText', () => {
  it('passe en minuscules, ôte les accents et change la ponctuation en espace', () => {
    expect(normalizeSearchText('  Éclair-CAFÉ, crème…  ')).toBe('eclair cafe creme');
  });
});

describe('typoBudget', () => {
  it.each([
    [1, 0],
    [3, 0],
    [4, 1],
    [7, 1],
    [8, 2],
    [12, 2],
  ])('un mot de %i lettres tolère %i faute(s)', (length, budget) => {
    expect(typoBudget(length)).toBe(budget);
  });
});

describe('damerauLevenshtein', () => {
  it.each([
    ['croissant', 'croissant', 0],
    ['croisant', 'croissant', 1],
    ['croisssant', 'croissant', 1],
    ['croixsant', 'croissant', 1],
    ['crosisant', 'croissant', 1],
    ['', 'abc', 3],
    ['abc', '', 3],
  ])('%s → %s = %i', (a, b, distance) => {
    expect(damerauLevenshtein(a, b)).toBe(distance);
  });
});

describe('searchProducts', () => {
  it('rend la liste telle quelle sur une requête vide ou blanche', () => {
    expect(searchProducts(ALL, '', KEYS)).toBe(ALL);
    expect(searchProducts(ALL, '   ', KEYS)).toBe(ALL);
  });

  it('trouve par début ou milieu de mot, sans accents ni casse', () => {
    expect(names('ECLA')).toEqual(['Éclair café']);
    expect(names('cafe')).toEqual(['Éclair café']);
    expect(names('ssan')).toEqual(['Croissant']);
  });

  it('accepte les mots dans n’importe quel ordre, et exige chacun', () => {
    expect(names('chocolat pain')).toEqual(['Pain au chocolat']);
    expect(names('pain pommes')).toEqual([]);
  });

  it('cherche aussi dans les textes de plus (la famille)', () => {
    expect(names('patisseries')).toEqual(['Éclair café']);
    expect(names('viennoiserie pomme')).toEqual(['Chausson aux pommes']);
  });

  it('marche sans textes de plus', () => {
    const keys: ProductSearchKeys<Item> = { nameOf: (i) => i.name, skuOf: (i) => i.sku };
    expect(searchProducts(ALL, 'viennoiseries', keys)).toEqual([]);
    expect(searchProducts(ALL, 'baguette', keys)).toEqual([BAGUETTE]);
  });

  describe('les fautes de frappe', () => {
    it.each([
      ['lettre manquante', 'croisant'],
      ['lettre en trop', 'croisssant'],
      ['lettre remplacée', 'croixsant'],
      ['lettres inversées', 'crosisant'],
    ])('%s : « %s » trouve le croissant', (_, typed) => {
      expect(names(typed)).toEqual(['Croissant']);
    });

    it('tolère la faute sur le début d’un mot tapé à moitié', () => {
      expect(names('crosi')).toEqual(['Croissant']);
      expect(names('baguete')).toEqual(['Baguette tradition']);
      expect(names('chocloat')).toEqual(['Pain au chocolat']);
    });

    it('n’en tolère aucune sous quatre lettres', () => {
      expect(names('cro')).toEqual(['Croissant']);
      expect(names('cor')).toEqual([]);
      expect(names('rpo')).toEqual([]);
    });

    it('en tolère une de quatre à sept lettres, pas deux', () => {
      expect(names('pomes')).toEqual(['Chausson aux pommes']);
      expect(names('pommse')).toEqual(['Chausson aux pommes']);
      expect(names('pxmxs')).toEqual([]);
    });

    it('en tolère deux à partir de huit lettres, pas trois', () => {
      expect(names('crosant')).toEqual([]);
      expect(names('croissxnz')).toEqual(['Croissant']);
      expect(names('crxissxnz')).toEqual([]);
    });
  });

  describe('le SKU', () => {
    it('se trouve en sous-chaîne, sans casse', () => {
      expect(names('vie-00')).toEqual(['Croissant', 'Pain au chocolat', 'Chausson aux pommes']);
      expect(names('pat-010')).toEqual(['Éclair café']);
    });

    it('peut être plusieurs : ceux des déclinaisons', () => {
      const keys: ProductSearchKeys<Item> = {
        nameOf: (item) => item.name,
        skuOf: (item) => [item.sku, `${item.sku}-B`],
      };
      expect(searchProducts(ALL, 'pai-001-b', keys)).toEqual([BAGUETTE]);
    });

    it('n’est jamais approché', () => {
      expect(names('VIE-009')).toEqual([]);
      expect(names('PAX-001')).toEqual([]);
    });
  });

  describe('le tri', () => {
    it('met le SKU exact, puis le nom qui commence, puis les mots exacts, puis les approchés', () => {
      const items: readonly Item[] = [
        { sku: 'X-1', name: 'Grand pain' },
        { sku: 'X-2', name: 'Pian blanc' },
        { sku: 'X-3', name: 'Pain de mie' },
        { sku: 'pain', name: 'Brioche' },
      ];
      expect(names('pain', items)).toEqual(['Brioche', 'Pain de mie', 'Grand pain', 'Pian blanc']);
    });

    it('garde l’ordre reçu à rang égal', () => {
      const items: readonly Item[] = [
        { sku: 'A', name: 'Tarte aux pommes' },
        { sku: 'B', name: 'Chausson aux pommes' },
        { sku: 'C', name: 'Compote de pommes' },
      ];
      expect(names('pommes', items)).toEqual([
        'Tarte aux pommes',
        'Chausson aux pommes',
        'Compote de pommes',
      ]);
      expect(names('pommes', [...items].reverse())).toEqual([
        'Compote de pommes',
        'Chausson aux pommes',
        'Tarte aux pommes',
      ]);
    });

    it('ne modifie pas la liste reçue', () => {
      const items = [...ALL];
      searchProducts(items, 'crois', KEYS);
      expect(items).toEqual(ALL);
    });
  });
});
