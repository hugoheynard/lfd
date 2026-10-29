import {
  countOf,
  focusOf,
  inSubtree,
  levelIdsOf,
  levelState,
  pathOf,
  ROOT_LEVEL,
  shelfTreeOf,
} from './shelf-tree';

/** L'arbre de la maquette (SPEC §1), réduit : Pâtisseries › Entremets › 8 parts. */
const TREE = shelfTreeOf([
  { id: 'all', label: 'Tout' },
  { id: 'vien', label: 'Viennoiseries', parentId: null },
  { id: 'pat', label: 'Pâtisseries', parentId: null },
  { id: 'pat-tar', label: 'Tartes', parentId: 'pat' },
  { id: 'pat-ent', label: 'Entremets', parentId: 'pat' },
  { id: 'pat-ent-8', label: '8 parts', parentId: 'pat-ent' },
]);

describe('shelf-tree', () => {
  it('pathOf va de la racine au nœud', () => {
    expect(pathOf(TREE, 'pat-ent-8')).toEqual(['pat', 'pat-ent', 'pat-ent-8']);
    expect(pathOf(TREE, 'inconnu')).toEqual([]);
  });

  it('focusOf : un nœud qui a des enfants est son propre niveau', () => {
    expect(focusOf(TREE, 'pat-ent')).toBe('pat-ent');
  });

  it('focusOf : une feuille affiche le niveau de sa parente — choisir une feuille ne change pas de niveau', () => {
    expect(focusOf(TREE, 'pat-ent-8')).toBe('pat-ent');
    expect(focusOf(TREE, 'pat-tar')).toBe('pat');
  });

  it('focusOf : une feuille de tête, rien ou un inconnu affichent la tête', () => {
    expect(focusOf(TREE, 'vien')).toBe(ROOT_LEVEL);
    expect(focusOf(TREE, 'all')).toBe(ROOT_LEVEL);
    expect(focusOf(TREE, null)).toBe(ROOT_LEVEL);
    expect(focusOf(TREE, 'inconnu')).toBe(ROOT_LEVEL);
  });

  it('levelState : ancêtres et tête à gauche, descendants et cousins à droite, un seul cur', () => {
    const states = levelIdsOf(TREE).map((id) => [id, levelState(TREE, id, 'pat-ent')]);

    expect(states).toEqual([
      [ROOT_LEVEL, 'left'],
      ['pat', 'left'],
      ['pat-ent', 'cur'],
    ]);
    expect(levelState(TREE, 'pat-ent', 'pat')).toBe('right');
    expect(levelState(TREE, 'pat', ROOT_LEVEL)).toBe('right');
  });

  it('countOf compte le sous-arbre entier', () => {
    const items = [{ shelfId: 'pat-tar' }, { shelfId: 'pat-ent-8' }, { shelfId: 'vien' }];

    expect(countOf(TREE, 'pat', items)).toBe(2);
    expect(countOf(TREE, 'pat-ent', items)).toBe(1);
    expect(inSubtree(TREE, 'pat-ent-8', 'pat')).toBe(true);
    expect(inSubtree(TREE, 'vien', 'pat')).toBe(false);
  });

  it('un catalogue sans parente n’est pas imbriqué, et une parente inconnue remonte en tête', () => {
    expect(shelfTreeOf([{ id: 'a', label: 'A' }]).nested).toBe(false);
    const orphan = shelfTreeOf([{ id: 'a', label: 'A', parentId: 'absente' }]);
    expect(orphan.roots).toEqual(['a']);
    expect(orphan.nested).toBe(false);
  });
});
