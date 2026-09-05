import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { ALL_SHELVES, SHOP_CATEGORIES } from '../../mock-shop';
import { FR } from '../../../copy/fr';
import { ShelfNav } from './shelf-nav';

describe('ShelfNav', () => {
  let fixture: ComponentFixture<ShelfNav>;

  const chips = (): HTMLButtonElement[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
  const lit = (): string[] =>
    chips()
      .filter((b) => b.classList.contains('on'))
      .map((b) => b.textContent?.trim() ?? '');

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ShelfNav] });
    fixture = TestBed.createComponent(ShelfNav);
    fixture.detectChanges();
  });

  it('ouvre par « Tout », puis les familles du catalogue dans l’ordre', () => {
    expect(labels(chips())).toEqual([FR.shop.allShelves, ...SHOP_CATEGORIES.map((c) => c.label)]);
  });

  it('allume le rayon qu’on lui désigne, et lui seul', () => {
    fixture.componentRef.setInput('active', SHOP_CATEGORIES[1]?.id);
    fixture.detectChanges();

    expect(lit()).toEqual([SHOP_CATEGORIES[1]?.label ?? '']);
  });

  /**
   * Chercher traverse les rayons : aucune pastille n'est alors juste. C'est la
   * PAGE qui l'arbitre, en passant `null` — le rail n'a pas à connaître le
   * terme cherché.
   */
  it('n’allume rien quand aucun rayon n’est désigné', () => {
    fixture.componentRef.setInput('active', null);
    fixture.detectChanges();

    expect(lit()).toEqual([]);
  });

  it('annonce l’état pressé, pas seulement une classe', () => {
    fixture.componentRef.setInput('active', ALL_SHELVES);
    fixture.detectChanges();

    expect(chips()[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(chips()[1]?.getAttribute('aria-pressed')).toBe('false');
  });

  it('signale le rayon choisi sans rien décider lui-même', () => {
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((id) => picked.push(id));

    chips()[2]?.click();

    expect(picked).toEqual([SHOP_CATEGORIES[1]?.id]);
  });
});

/** Les libellés, dans l'ordre du rail. */
function labels(buttons: readonly HTMLButtonElement[]): string[] {
  return buttons.map((b) => b.textContent?.trim() ?? '');
}
