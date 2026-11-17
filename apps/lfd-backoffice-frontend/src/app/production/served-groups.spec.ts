import type { ProductionGroupingEntryView, ProductionGroupingView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { servedGroups, UNGROUPED_KEY } from './served-groups';

interface Line {
  readonly sku: string;
  readonly quantity: number;
}

const biggestFirst = (left: Line, right: Line): number => right.quantity - left.quantity;

function entry(
  sku: string,
  key: string,
  title: string,
  order: number,
  section: ProductionGroupingEntryView['section'] = null,
): ProductionGroupingEntryView {
  return {
    sku,
    key,
    title,
    kind: key.startsWith('ws:') ? 'workstation' : 'unplaced',
    order,
    section,
  };
}

function grouping(
  entries: readonly ProductionGroupingEntryView[],
  showSubcategories = false,
): ProductionGroupingView {
  return {
    mode: 'workstation',
    showSubcategories,
    shelvesKnown: true,
    workstationsKnown: true,
    entries,
  };
}

const LINES: readonly Line[] = [
  { sku: 'QUI', quantity: 4 },
  { sku: 'CRO', quantity: 40 },
  { sku: 'TAR', quantity: 12 },
  { sku: 'PAC', quantity: 30 },
];

describe('le rangement servi', () => {
  it('range par groupe dans l’ordre du serveur, le plus gros d’abord dans chaque groupe', () => {
    const groups = servedGroups(
      LINES,
      grouping([
        entry('QUI', 'ws:pat', 'Pâtisserie', 0),
        entry('TAR', 'ws:pat', 'Pâtisserie', 0),
        entry('CRO', 'fam_v', 'Viennoiserie — à ranger', 1),
        entry('PAC', 'fam_v', 'Viennoiserie — à ranger', 1),
      ]),
      biggestFirst,
    );

    expect(groups.map((group) => [group.title, group.lines.map((line) => line.sku)])).toEqual([
      ['Pâtisserie', ['TAR', 'QUI']],
      ['Viennoiserie — à ranger', ['CRO', 'PAC']],
    ]);
    expect(groups[1]?.kind).toBe('unplaced');
  });

  it('pose un intertitre par section servie quand le réglage les affiche', () => {
    const tarts = { key: 'fam_tarts', label: 'Tartes', order: 1 };
    const savoury = { key: 'fam_sal', label: 'Traiteur salé', order: 0 };
    const [group] = servedGroups(
      LINES.filter((line) => line.sku === 'QUI' || line.sku === 'TAR'),
      grouping(
        [
          entry('QUI', 'ws:pat', 'Pâtisserie', 0, savoury),
          entry('TAR', 'ws:pat', 'Pâtisserie', 0, tarts),
        ],
        true,
      ),
      biggestFirst,
    );

    expect(group?.lines.map((line) => line.sku)).toEqual(['QUI', 'TAR']);
    expect([...(group?.intertitles ?? new Map<string, string>())]).toEqual([
      ['QUI', 'Traiteur salé'],
      ['TAR', 'Tartes'],
    ]);
  });

  it('un rangement non lu ne perd aucune ligne : tout tombe en « Rayon inconnu »', () => {
    const groups = servedGroups(LINES, null, biggestFirst);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe(UNGROUPED_KEY);
    expect(groups[0]?.title).toBe('Rayon inconnu');
    expect(groups[0]?.lines).toHaveLength(4);
  });

  it('un SKU que le rangement ne nomme pas va en dernier, à part', () => {
    const groups = servedGroups(
      LINES,
      grouping([entry('CRO', 'ws:four', 'Four', 0)]),
      biggestFirst,
    );

    expect(groups.map((group) => group.key)).toEqual(['ws:four', UNGROUPED_KEY]);
    expect(groups[1]?.lines.map((line) => line.sku)).toEqual(['PAC', 'TAR', 'QUI']);
  });
});
