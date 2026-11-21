import type { WorkshopGroup, WorkshopLine, WorkshopSection } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { groupOptions, groupTabs, intertitlesOf } from './workshop-tabs';

function line(sku: string, over: Partial<WorkshopLine> = {}): WorkshopLine {
  return {
    sku,
    productName: sku,
    quantity: 10,
    saleUnit: 'piece',
    containerLabel: null,
    done: false,
    initials: null,
    doneAt: null,
    produced: 0,
    remaining: 10,
    surplus: 0,
    batches: [],
    container: null,
    ...over,
  };
}

function group(key: string, over: Partial<WorkshopGroup> = {}): WorkshopGroup {
  return {
    key,
    family: null,
    category: null,
    label: key,
    lineCount: 0,
    doneCount: 0,
    totalUnits: 0,
    remainingUnits: 0,
    doneUnits: 0,
    lines: [],
    pending: [],
    done: [],
    ...over,
  };
}

const WAITING = { count: 1, earliestHandover: '08:45' };

describe('les onglets de la fiche', () => {
  it('ne rend aucun onglet sans groupe', () => {
    expect(groupTabs([])).toEqual([]);
  });

  it('montre l’avancement tel que servi, sans point quand rien ne presse', () => {
    const tabs = groupTabs([
      group('viennoiserie', { label: 'Viennoiserie', doneCount: 2, lineCount: 5 }),
    ]);

    expect(tabs).toEqual([{ key: 'viennoiserie', label: 'Viennoiserie', badge: '2/5' }]);
  });

  it('pose un point ambre quand une ligne non faite attend le four', () => {
    const [tab] = groupTabs([
      group('pain', { lines: [line('A'), line('B', { waitingOrders: WAITING })] }),
    ]);

    expect(tab).toMatchObject({ dot: 'warning', dotLabel: 'une commande attend le four' });
  });

  it('ne pose pas de point pour une ligne déjà faite, ni sans commande en attente', () => {
    const [done, none] = groupTabs([
      group('a', { lines: [line('A', { done: true, waitingOrders: WAITING })] }),
      group('b', { lines: [line('B', { waitingOrders: null })] }),
    ]);

    expect(done).not.toHaveProperty('dot');
    expect(none).not.toHaveProperty('dot');
  });
});

describe('les options du sélecteur', () => {
  it('dit le reste à sortir de chaque rayon, dans l’ordre servi', () => {
    expect(
      groupOptions([
        group('a', { label: 'Pains', remainingUnits: 12 }),
        group('b', { label: 'Tartes', remainingUnits: 0 }),
      ]),
    ).toEqual([
      { value: 'a', label: 'Pains · 12 à sortir' },
      { value: 'b', label: 'Tartes · 0 à sortir' },
    ]);
  });

  it('ne rend aucune option sans groupe', () => {
    expect(groupOptions([])).toEqual([]);
  });
});

describe('les intertitres', () => {
  const sections: readonly WorkshopSection[] = [
    { key: null, label: null, skus: ['RAC'] },
    { key: 's1', label: 'Viennoiseries', skus: ['CRO', 'PAC'] },
    { key: 's2', label: 'Pains', skus: ['BAG'] },
  ];
  const lines = ['RAC', 'CRO', 'PAC', 'BAG'].map((sku) => line(sku));

  it('ne rend rien sans groupe', () => {
    expect(intertitlesOf(null, lines).size).toBe(0);
  });

  it('ne rend rien quand le groupe ne sert pas de sections', () => {
    expect(intertitlesOf(group('a'), lines).size).toBe(0);
  });

  it('pose l’intertitre à la première ligne de chaque section, pas à la racine', () => {
    expect([...intertitlesOf(group('a', { sections }), lines)]).toEqual([
      ['CRO', 'Viennoiseries'],
      ['BAG', 'Pains'],
    ]);
  });

  it('ne rend rien pour une liste de lignes vide', () => {
    expect(intertitlesOf(group('a', { sections }), []).size).toBe(0);
  });
});
