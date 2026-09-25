import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { provideHttpClient } from '@angular/common/http';

import { ALL_SHELVES } from '../../shelves';
import {
  hydrateWith,
  operationCatalogue,
  TEST_CATALOGUE,
  TEST_OPERATION_KEY,
  TEST_SHELVES,
} from '../../shop-catalogue.fixture';
import { ClientLocale } from '../../../client-locale.service';
import { ShopCatalogue } from '../../shop-catalogue.store';
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
    TestBed.configureTestingModule({ imports: [ShelfNav], providers: [provideHttpClient()] });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    fixture = TestBed.createComponent(ShelfNav);
    fixture.detectChanges();
  });

  it('ouvre par « Tout », puis les familles du catalogue dans l’ordre', () => {
    expect(labels(chips())).toEqual([
      FR.shop.allShelves,
      ...TEST_SHELVES.map((shelf) => shelf.name),
    ]);
  });

  it('allume le rayon qu’on lui désigne, et lui seul', () => {
    fixture.componentRef.setInput('active', TEST_SHELVES[1]?.id);
    fixture.detectChanges();

    expect(lit()).toEqual([TEST_SHELVES[1]?.name ?? '']);
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

    expect(picked).toEqual([TEST_SHELVES[1]?.id]);
  });

  /** D8 : une opération servie est un rayon juste après « Tout », avant les familles. */
  it('place une opération servie juste après « Tout »', () => {
    hydrateWith(TestBed.inject(ShopCatalogue), operationCatalogue('announced'));
    fixture.detectChanges();

    expect(labels(chips()).slice(0, 3)).toEqual([
      FR.shop.allShelves,
      'Noël',
      TEST_SHELVES[0]?.name,
    ]);
  });

  it('nomme l’opération dans la langue de l’interface, le français faute de mieux', () => {
    hydrateWith(TestBed.inject(ShopCatalogue), operationCatalogue('open'));
    const locale = TestBed.inject(ClientLocale);

    locale.current.set('en');
    fixture.detectChanges();
    expect(labels(chips())[1]).toBe('Christmas');

    // Le référentiel n'a pas saisi l'italien : le français le remplace.
    locale.current.set('it');
    fixture.detectChanges();
    expect(labels(chips())[1]).toBe('Noël');
  });

  it('signale la clé `op:<key>` quand on choisit l’opération', () => {
    hydrateWith(TestBed.inject(ShopCatalogue), operationCatalogue('open'));
    fixture.detectChanges();
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((id) => picked.push(id));

    chips()[1]?.click();

    expect(picked).toEqual([`op:${TEST_OPERATION_KEY}`]);
  });
});

/** Les libellés, dans l'ordre du rail. */
function labels(buttons: readonly HTMLButtonElement[]): string[] {
  return buttons.map((b) => b.textContent?.trim() ?? '');
}
