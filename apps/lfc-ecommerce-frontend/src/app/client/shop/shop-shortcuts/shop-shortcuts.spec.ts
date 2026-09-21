import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ShopShortcuts, type ShortcutCard } from './shop-shortcuts';

const AGAIN: ShortcutCard = { title: 'Comme samedi dernier ?', sub: '2 traditions · retrait' };
const BROWSE: ShortcutCard = { title: 'Je visite la boutique', sub: 'Pour voir les produits' };

function boot(
  again: ShortcutCard | null,
  browseCard: ShortcutCard | null,
): ComponentFixture<ShopShortcuts> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ShopShortcuts] });
  const fixture = TestBed.createComponent(ShopShortcuts);
  fixture.componentRef.setInput('again', again);
  fixture.componentRef.setInput('againLead', 'Ou reprenez');
  fixture.componentRef.setInput('againAction', 'Refaire');
  fixture.componentRef.setInput('browseCard', browseCard);
  fixture.detectChanges();
  return fixture;
}

const rows = (fixture: ComponentFixture<ShopShortcuts>): readonly Element[] => [
  ...(fixture.nativeElement as HTMLElement).querySelectorAll('app-shortcut-row'),
];

describe('ShopShortcuts', () => {
  it('range « reprenez » avant la sortie — c’est le geste le plus court', () => {
    const fixture = boot(AGAIN, BROWSE);

    expect(rows(fixture)).toHaveLength(2);
    expect(rows(fixture)[0]?.textContent).toContain(AGAIN.title);
    expect(rows(fixture)[1]?.textContent).toContain(BROWSE.title);
  });

  /**
   * 🔴 LES DEUX CARTES SONT INDÉPENDANTES. « Reprenez » n'existe que s'il y a
   * une commande à reprendre ; la sortie vers la boutique, que là où le bandeau
   * — qui porte déjà la sienne — est absent. Une rangée qui en montrerait une
   * vide proposerait de refaire ce qu'on n'a jamais commandé.
   */
  it.each([
    ['sans commande à reprendre', null, BROWSE, BROWSE.title],
    ['sans sortie', AGAIN, null, AGAIN.title],
  ] as const)('n’en rend qu’une %s', (_cas, again, browse, attendu) => {
    const fixture = boot(again, browse);

    expect(rows(fixture)).toHaveLength(1);
    expect(rows(fixture)[0]?.textContent).toContain(attendu);
  });

  it('ne rend rien quand il n’y a ni l’une ni l’autre', () => {
    expect(rows(boot(null, null))).toHaveLength(0);
  });

  /**
   * La rangée émet, elle n'agit pas : c'est l'écran qui sait ce qu'un raccourci
   * déclenche — refaire un panier n'est pas la même chose selon qui regarde.
   */
  it('émet le choix plutôt que d’agir', () => {
    const fixture = boot(AGAIN, BROWSE);
    const choisis: string[] = [];
    fixture.componentInstance.reordered.subscribe(() => choisis.push('refaire'));
    fixture.componentInstance.browsed.subscribe(() => choisis.push('visiter'));

    rows(fixture).forEach((row) => row.querySelector('button')?.click());

    expect(choisis).toEqual(['refaire', 'visiter']);
  });
});
