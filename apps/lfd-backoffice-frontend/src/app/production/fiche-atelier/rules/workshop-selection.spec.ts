import { describe, expect, it } from 'vitest';

import {
  type SelectableGroup,
  groupKeyOfLine,
  linkedElsewhereDay,
  linkedSkuOf,
  pickGroup,
} from './workshop-selection';

function group(key: string, skus: readonly string[] = []): SelectableGroup {
  return { key, lines: skus.map((sku) => ({ sku })) };
}

const GROUPS = [group('viennoiserie', ['CRO']), group('poste:four', ['PAIN'])];

describe('quelle fiche ouvrir', () => {
  it('la première clé qui existe gagne, dans l’ordre de priorité', () => {
    expect(pickGroup(GROUPS, [null, 'poste:four', 'viennoiserie'])?.key).toBe('poste:four');
  });

  it('une clé inconnue est sautée, pas une erreur', () => {
    expect(pickGroup(GROUPS, ['disparue', 'viennoiserie'])?.key).toBe('viennoiserie');
  });

  it('sans clé connue, la première fiche servie', () => {
    expect(pickGroup(GROUPS, [null, null])?.key).toBe('viennoiserie');
  });

  it('aucune fiche servie : rien', () => {
    expect(pickGroup([], ['viennoiserie'])).toBeNull();
  });

  it('la fiche qui porte la ligne du lien', () => {
    expect(groupKeyOfLine(GROUPS, 'PAIN')).toBe('poste:four');
    expect(groupKeyOfLine(GROUPS, 'ABSENT')).toBeNull();
    expect(groupKeyOfLine(GROUPS, null)).toBeNull();
  });
});

describe('la ligne du lien de la cloche', () => {
  it('vaut sur la journée lue', () => {
    expect(linkedSkuOf('CRO', '2026-11-20', '2026-11-20')).toBe('CRO');
  });

  it('un lien sans jour vaut pour la journée lue', () => {
    expect(linkedSkuOf('CRO', undefined, '2026-11-20')).toBe('CRO');
    expect(linkedSkuOf('CRO', '', '2026-11-20')).toBe('CRO');
  });

  it('un lien vers une autre journée ne désigne rien ici, et la fiche dit laquelle', () => {
    expect(linkedSkuOf('CRO', '2026-11-19', '2026-11-20')).toBeNull();
    expect(linkedElsewhereDay('2026-11-19', '2026-11-20')).toBe('2026-11-19');
  });

  it('tant que la journée n’est pas lue, rien', () => {
    expect(linkedSkuOf('CRO', '2026-11-20', null)).toBeNull();
    expect(linkedElsewhereDay('2026-11-20', null)).toBeNull();
  });

  it('pas de ligne demandée : rien', () => {
    expect(linkedSkuOf(undefined, '2026-11-20', '2026-11-20')).toBeNull();
    expect(linkedSkuOf('', undefined, '2026-11-20')).toBeNull();
  });
});
