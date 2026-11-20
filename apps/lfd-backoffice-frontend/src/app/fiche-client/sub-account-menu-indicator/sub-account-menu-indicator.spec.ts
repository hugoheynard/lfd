import { TestBed } from '@angular/core/testing';
import type { SubAccountMenuSummary } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { SubAccountMenuIndicator } from './sub-account-menu-indicator';

function render(menu: SubAccountMenuSummary | null): HTMLElement {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(SubAccountMenuIndicator);
  fixture.componentRef.setInput('menu', menu);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('SubAccountMenuIndicator', () => {
  it('dit la forme et le nombre d’entrées d’une carte posée', () => {
    const host = render({ mode: 'only', offMenu: 'hidden', entryCount: 1 });
    expect(host.textContent).toContain('Carte : liste blanche, 1 entrée');
  });

  it('ne dit rien sans carte', () => {
    expect(render(null).querySelector('[data-menu-indicator]')).toBeNull();
  });
});
