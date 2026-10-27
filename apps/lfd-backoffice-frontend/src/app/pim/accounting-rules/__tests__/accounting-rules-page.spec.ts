import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { AccountingRulesPage } from '../accounting-rules-page/accounting-rules-page';

function render(): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(AccountingRulesPage);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/**
 * Régression (lot R3 de `plan-retirer-le-rapport-pro.md`, 2026-10-27) : la
 * page réglait le rapport pro, son simulateur et « Passer au prix saisi ».
 * Le prix pro est toujours saisi ; elle ne dit plus que où il se règle, et
 * n'appelle plus aucune route.
 */
describe('AccountingRulesPage — après le retrait du rapport', () => {
  it('dit que le prix pro se saisit sur chaque fiche', () => {
    const text = render().textContent ?? '';

    expect(text).toContain('Plus rien à régler ici');
    expect(text).toContain('Tarif');
  });

  it('ne propose plus ni remise, ni simulateur, ni bascule de méthode', () => {
    const host = render();
    const text = host.textContent ?? '';

    expect(host.querySelector('fold-number-input')).toBeNull();
    expect(host.querySelector('button')).toBeNull();
    expect(text).not.toContain('Rapport suggéré');
    expect(text).not.toContain('Passer au prix saisi');
    expect(text).not.toContain('Reprendre');
  });

  it('mène au catalogue, où le prix pro se saisit', () => {
    const link = render().querySelector('a');

    expect(link?.getAttribute('href')).toBe('/pim/catalogue');
  });
});
