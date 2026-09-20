import { groupRailItems, type WorkspaceRailItem } from '../workspace-rail.store';

function view(key: string, section?: string): WorkspaceRailItem {
  return { key, label: key, link: `/${key}`, icon: 'grid', ...(section ? { section } : {}) };
}

describe('grouper les vues du rail', () => {
  it('rend UN groupe sans titre quand rien n’est groupé', () => {
    // Les quatre espaces existants sont dans ce cas : ils doivent se rendre
    // exactement comme avant l'arrivée des sections.
    const groups = groupRailItems([view('a'), view('b')]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBeUndefined();
    expect(groups[0]?.items.map((i) => i.key)).toEqual(['a', 'b']);
  });

  it('ouvre un groupe à chaque changement de section', () => {
    const groups = groupRailItems([
      view('a', 'Application'),
      view('b', 'Application'),
      view('c', 'Pages'),
    ]);

    expect(groups.map((g) => g.label)).toEqual(['Application', 'Pages']);
    expect(groups[0]?.items).toHaveLength(2);
  });

  it('suit l’ORDRE de la table, sans réordonner', () => {
    // Ce qu'on lit dans `workspaces.ts` est ce qu'on voit dans le rail : une
    // section qui reviendrait plus bas rouvre un groupe, elle ne fusionne pas
    // avec le premier. Réordonner ferait mentir la table.
    const groups = groupRailItems([view('a', 'X'), view('b', 'Y'), view('c', 'X')]);

    expect(groups.map((g) => g.label)).toEqual(['X', 'Y', 'X']);
  });

  it('mêle sans titre et sections, dans l’ordre déclaré', () => {
    const groups = groupRailItems([view('a'), view('b', 'Application')]);

    expect(groups.map((g) => g.label)).toEqual([undefined, 'Application']);
  });
});
