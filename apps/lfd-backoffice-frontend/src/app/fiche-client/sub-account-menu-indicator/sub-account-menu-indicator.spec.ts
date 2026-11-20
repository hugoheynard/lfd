import { TestBed } from '@angular/core/testing';
import type { SiteMenuStanding, SubAccountMenuSummary } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { SubAccountMenuIndicator } from './sub-account-menu-indicator';

function render(state: SiteMenuStanding, menu: SubAccountMenuSummary | null): HTMLElement {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(SubAccountMenuIndicator);
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('menu', menu);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('SubAccountMenuIndicator', () => {
  it('dit une carte propre, sa forme et son nombre d’entrées', () => {
    const host = render('own', { mode: 'only', offMenu: 'hidden', entryCount: 1 });
    expect(host.textContent).toContain('Carte propre : liste blanche, 1 entrée');
  });

  it('dit la carte commune que le site suit', () => {
    const host = render('common', { mode: 'except', offMenu: 'hidden', entryCount: 2 });
    expect(host.textContent).toContain('Carte commune : liste noire, 2 entrées');
  });

  it('ne dit rien sans carte', () => {
    expect(render('none', null).querySelector('[data-menu-indicator]')).toBeNull();
  });
});
