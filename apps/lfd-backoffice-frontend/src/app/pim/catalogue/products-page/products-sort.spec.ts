import { describe, expect, it } from 'vitest';

import { compareLabels, nextSort, sortRows } from './products-sort';

interface Row {
  readonly name: string;
  readonly family?: string;
}

const ROWS: readonly Row[] = [
  { name: 'Zeste', family: 'Viennoiseries' },
  { name: 'Éclair', family: 'Pâtisseries' },
  { name: 'brioche', family: 'Boulangerie' },
];

const byName = (row: Row): string => row.name;
const byFamily = (row: Row): string | undefined => row.family;
const names = (rows: readonly Row[]): string[] => rows.map((row) => row.name);

describe('compareLabels', () => {
  /**
   * 🔴 Le cas qui justifie `localeCompare`, et il n'est pas théorique : une
   * comparaison par `<` range « Éclair » APRÈS « Zeste », parce qu'elle compare
   * des points de code UTF-16. Dans une boulangerie, la moitié des noms portent
   * un accent.
   */
  it('range un accent à la lettre, pas à son point de code', () => {
    expect(compareLabels('Éclair', 'Zeste')).toBeLessThan(0);
    // Ce que ferait une comparaison naïve, pour que l'écart soit visible ici.
    expect('Éclair' < 'Zeste').toBe(false);
  });

  it('ne fait pas deux blocs des majuscules et des minuscules', () => {
    expect(compareLabels('brioche', 'Zeste')).toBeLessThan(0);
    expect('brioche' < 'Zeste').toBe(false);
  });

  it('tient « e » et « é » pour la même lettre', () => {
    expect(compareLabels('eclair', 'éclair')).toBe(0);
  });
});

describe('nextSort', () => {
  it('un premier clic trie en croissant', () => {
    expect(nextSort(null, 'name')).toEqual({ key: 'name', dir: 'asc' });
  });

  it('un second clic inverse', () => {
    expect(nextSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' });
  });

  /**
   * Sans ce troisième état, l'ordre d'origine du serveur devient inatteignable
   * une fois qu'on a trié — il n'y a plus de retour qu'en rechargeant la page.
   */
  it('un troisième clic rend l’ordre d’origine', () => {
    expect(nextSort({ key: 'name', dir: 'desc' }, 'name')).toBeNull();
  });

  it('changer de colonne repart en croissant, sans hériter du sens', () => {
    expect(nextSort({ key: 'name', dir: 'desc' }, 'category')).toEqual({
      key: 'category',
      dir: 'asc',
    });
  });
});

describe('sortRows', () => {
  it('sans tri, rend la liste telle quelle — et la MÊME référence', () => {
    const result = sortRows(ROWS, null, byName);

    expect(result).toBe(ROWS);
  });

  it('ne modifie jamais le tableau reçu', () => {
    const before = names(ROWS);

    sortRows(ROWS, { key: 'name', dir: 'desc' }, byName);

    expect(names(ROWS)).toEqual(before);
  });

  it('trie par nom, dans les deux sens', () => {
    expect(names(sortRows(ROWS, { key: 'name', dir: 'asc' }, byName))).toEqual([
      'brioche',
      'Éclair',
      'Zeste',
    ]);
    expect(names(sortRows(ROWS, { key: 'name', dir: 'desc' }, byName))).toEqual([
      'Zeste',
      'Éclair',
      'brioche',
    ]);
  });

  it('trie par famille, qui n’est pas l’ordre des noms', () => {
    // Boulangerie · Pâtisseries · Viennoiseries
    expect(names(sortRows(ROWS, { key: 'family', dir: 'asc' }, byFamily))).toEqual([
      'brioche',
      'Éclair',
      'Zeste',
    ]);
  });

  /**
   * Une ligne sans valeur reste au bout **dans les deux sens** : elle n'est pas
   * prioritaire parce qu'elle est incomplète. L'inverser en `desc` la ferait
   * remonter en tête de liste, à l'endroit le plus visible de l'écran.
   */
  it('range les lignes sans valeur au bout, quel que soit le sens', () => {
    const rows: readonly Row[] = [{ name: 'orphelin' }, ...ROWS];

    expect(names(sortRows(rows, { key: 'family', dir: 'asc' }, byFamily)).at(-1)).toBe('orphelin');
    expect(names(sortRows(rows, { key: 'family', dir: 'desc' }, byFamily)).at(-1)).toBe('orphelin');
  });
});
