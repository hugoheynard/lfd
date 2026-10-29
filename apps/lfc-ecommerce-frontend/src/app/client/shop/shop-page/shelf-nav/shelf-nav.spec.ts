import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { provideHttpClient } from '@angular/common/http';

import { ALL_SHELVES, FEATURED_SHELF } from '../../shelves';
import {
  hydrateWith,
  NESTED_CATALOGUE,
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

  it('ouvre par « Tout », la mise en avant, puis les familles du catalogue dans l’ordre', () => {
    expect(labels(chips())).toEqual([
      FR.shop.allShelves,
      FR.product.bestSeller,
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

    chips()[3]?.click();

    expect(picked).toEqual([TEST_SHELVES[1]?.id]);
  });

  it('signale la clé dédiée quand on choisit la mise en avant', () => {
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((id) => picked.push(id));

    chips()[1]?.click();

    expect(picked).toEqual([FEATURED_SHELF]);
  });

  /** D8 : une opération servie est un rayon juste après « Tout », avant les familles. */
  it('place une opération servie juste après « Tout »', () => {
    hydrateWith(TestBed.inject(ShopCatalogue), operationCatalogue('announced'));
    fixture.detectChanges();

    expect(labels(chips()).slice(0, 4)).toEqual([
      FR.shop.allShelves,
      FR.product.bestSeller,
      'Noël',
      TEST_SHELVES[0]?.name,
    ]);
  });

  it('nomme l’opération dans la langue de l’interface, le français faute de mieux', () => {
    hydrateWith(TestBed.inject(ShopCatalogue), operationCatalogue('open'));
    const locale = TestBed.inject(ClientLocale);

    locale.current.set('en');
    fixture.detectChanges();
    expect(labels(chips())[2]).toBe('Christmas');

    // Le référentiel n'a pas saisi l'italien : le français le remplace.
    locale.current.set('it');
    fixture.detectChanges();
    expect(labels(chips())[2]).toBe('Noël');
  });

  it('signale la clé `op:<key>` quand on choisit l’opération', () => {
    hydrateWith(TestBed.inject(ShopCatalogue), operationCatalogue('open'));
    fixture.detectChanges();
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((id) => picked.push(id));

    chips()[2]?.click();

    expect(picked).toEqual([`op:${TEST_OPERATION_KEY}`]);
  });
});

/** « Plonger » : les familles imbriquées (handoff du 2026-10-29, SPEC §8, §10). */
describe('ShelfNav — familles imbriquées', () => {
  let fixture: ComponentFixture<ShelfNav>;
  let picked: string[];

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const level = (id: string): HTMLElement | null =>
    root().querySelector<HTMLElement>(`.level[data-level="${id}"]`);
  const current = (): string | null =>
    root().querySelector<HTMLElement>('.level.is-cur')?.dataset['level'] ?? null;
  const chip = (levelId: string, shelf: string): HTMLButtonElement | null =>
    level(levelId)?.querySelector<HTMLButtonElement>(`.chip[data-shelf="${shelf}"]`) ?? null;

  /** La page fait suivre `active` à ce que le rail signale : on la joue. */
  async function choose(target: HTMLElement | null | undefined): Promise<void> {
    target?.click();
    fixture.componentRef.setInput('active', picked.at(-1));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [ShelfNav], providers: [provideHttpClient()] });
    hydrateWith(TestBed.inject(ShopCatalogue), NESTED_CATALOGUE);
    fixture = TestBed.createComponent(ShelfNav);
    picked = [];
    fixture.componentInstance.picked.subscribe((id) => picked.push(id));
    await fixture.whenStable();
  });

  it('monte la tête et un niveau par famille qui a des enfants, seule la tête atteignable', () => {
    const levels = Array.from(root().querySelectorAll<HTMLElement>('.level'));

    expect(levels.map((entry) => entry.dataset['level'])).toEqual(['root', 'cat_patis', 'cat_ent']);
    expect(current()).toBe('root');
    expect(levels.map((entry) => entry.hasAttribute('inert'))).toEqual([false, true, true]);
    expect(level('root')?.getAttribute('role')).toBe('toolbar');
  });

  it('annonce les sous-familles d’une pastille qui plonge', () => {
    const patis = chip('root', 'cat_patis');

    expect(patis?.getAttribute('aria-haspopup')).toBe('true');
    expect(patis?.getAttribute('aria-label')).toBe('Pâtisseries, 2 sous-familles');
    expect(chip('root', 'cat_vien')?.hasAttribute('aria-haspopup')).toBe(false);
  });

  it('plonge, la tête part à gauche, et le focus va sur la pastille de tête', async () => {
    await choose(chip('root', 'cat_patis'));

    expect(picked).toEqual(['cat_patis']);
    expect(current()).toBe('cat_patis');
    expect(level('root')?.classList).toContain('is-left');
    expect(level('cat_ent')?.classList).toContain('is-right');
    expect(document.activeElement).toBe(level('cat_patis')?.querySelector('.pill'));
    expect(level('cat_patis')?.querySelector('.pill')?.getAttribute('aria-label')).toBe(
      'Remonter à toute la boutique',
    );
  });

  it('compte le sous-arbre entier sur la pastille d’une parente', async () => {
    await choose(chip('root', 'cat_patis'));

    expect(level('cat_patis')?.querySelector('.pill .count')?.textContent?.trim()).toBe('3');
  });

  it('choisir une feuille ne change pas de niveau', async () => {
    await choose(chip('root', 'cat_patis'));
    await choose(chip('cat_patis', 'cat_ent'));
    await choose(chip('cat_ent', 'cat_ent_8'));

    expect(current()).toBe('cat_ent');
    expect(chip('cat_ent', 'cat_ent_8')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('Échap remonte d’un cran, et le focus revient sur la pastille d’où l’on venait', async () => {
    await choose(chip('root', 'cat_patis'));
    await choose(chip('cat_patis', 'cat_ent'));

    root()
      .querySelector('.stage')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.componentRef.setInput('active', picked.at(-1));
    await fixture.whenStable();

    expect(picked.at(-1)).toBe('cat_patis');
    expect(current()).toBe('cat_patis');
    expect(document.activeElement).toBe(chip('cat_patis', 'cat_ent'));
  });

  it('le fil d’Ariane remonte de plusieurs crans en une fois', async () => {
    await choose(chip('root', 'cat_patis'));
    await choose(chip('cat_patis', 'cat_ent'));

    await choose(level('cat_ent')?.querySelector<HTMLElement>('.crumb'));

    expect(picked.at(-1)).toBe(ALL_SHELVES);
    expect(current()).toBe('root');
    expect(level('cat_patis')?.classList).toContain('is-right');
    expect(level('cat_ent')?.classList).toContain('is-right');
    expect(document.activeElement).toBe(chip('root', 'cat_patis'));
  });

  it('pose un délai d’entrée sur les pastilles du niveau affiché seulement', async () => {
    await choose(chip('root', 'cat_patis'));

    expect(chip('cat_patis', 'cat_tar')?.style.getPropertyValue('--d')).toBe('178ms');
    expect(chip('root', 'cat_vien')?.style.getPropertyValue('--d')).toBe('0ms');
  });
});

/** Les libellés, dans l'ordre du rail. */
function labels(buttons: readonly HTMLButtonElement[]): string[] {
  return buttons.map((b) => b.textContent?.trim() ?? '');
}
