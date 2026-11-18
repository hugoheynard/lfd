import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ArchivedList, type ArchivedEntry } from './archived-list';

const ENTRIES: readonly ArchivedEntry[] = [
  { key: 'tva_1', label: 'Réduit', detail: '5,5 %' },
  { key: 'tva_2', label: 'Ancien' },
];

function render(entries: readonly ArchivedEntry[], canRestore = true): HTMLElement {
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(ArchivedList);
  fixture.componentRef.setInput('title', 'Taux archivés');
  fixture.componentRef.setInput('entries', entries);
  fixture.componentRef.setInput('restoreMessage', 'Restaurer ce taux ?');
  fixture.componentRef.setInput('canRestore', canRestore);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ArchivedList', () => {
  it('ne rend rien quand rien n’est archivé', () => {
    expect(render([]).textContent?.trim()).toBe('');
  });

  it('nomme le groupe avec son compte, et chaque ligne avec son détail', () => {
    const host = render(ENTRIES);

    expect(host.textContent).toContain('Taux archivés (2)');
    expect(host.textContent).toContain('Réduit');
    expect(host.textContent).toContain('5,5 %');
  });

  it('n’offre « Restaurer » qu’à qui peut écrire', () => {
    const count = (host: HTMLElement): number =>
      [...host.querySelectorAll('button')].filter((b) =>
        (b.textContent ?? '').includes('Restaurer'),
      ).length;

    expect(count(render(ENTRIES, false))).toBe(0);
    TestBed.resetTestingModule();
    expect(count(render(ENTRIES, true))).toBe(2);
  });
});
