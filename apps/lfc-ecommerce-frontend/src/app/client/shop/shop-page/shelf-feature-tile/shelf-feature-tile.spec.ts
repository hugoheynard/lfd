import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { FR } from '../../../copy/fr';
import { type ShelfFeature } from '../../mock-shelf-feature';
import { ShelfFeatureTile } from './shelf-feature-tile';

const FEATURE: ShelfFeature = {
  badge: 'Noël · J‑18',
  title: 'Le rayon de Noël',
  lede: 'Bûches et papillotes.',
  image: 'https://example.test/buche.jpg',
  shelfId: 'cat_noel',
};

describe('ShelfFeatureTile', () => {
  let fixture: ComponentFixture<ShelfFeatureTile>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const action = (): HTMLButtonElement | null => el().querySelector('button');

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ShelfFeatureTile] });
    fixture = TestBed.createComponent(ShelfFeatureTile);
    fixture.componentRef.setInput('feature', FEATURE);
    fixture.detectChanges();
  });

  it('montre la pastille, le titre, la phrase et la photo', () => {
    expect(el().querySelector('.badge')?.textContent?.trim()).toBe(FEATURE.badge);
    expect(el().querySelector('.title')?.textContent?.trim()).toBe(FEATURE.title);
    expect(el().querySelector('.lede')?.textContent?.trim()).toBe(FEATURE.lede);
    expect(el().querySelector('img')?.getAttribute('src')).toBe(FEATURE.image);
    expect(action()?.textContent?.trim()).toBe(FR.shop.openFeatureShelf);
  });

  it('ouvre le rayon de l’opération', () => {
    const opened: string[] = [];
    fixture.componentInstance.opened.subscribe((id) => opened.push(id));

    action()?.click();

    expect(opened).toEqual(['cat_noel']);
  });

  /** Une opération sans rayon n'a rien à ouvrir : pas de bouton qui ne mène nulle part. */
  it('sans rayon, se montre sans action', () => {
    fixture.componentRef.setInput('feature', { ...FEATURE, shelfId: null });
    fixture.detectChanges();

    expect(el().querySelector('.title')).not.toBeNull();
    expect(action()).toBeNull();
  });

  it('le format 2 × 2 se lit sur l’hôte', () => {
    expect(el().classList.contains('block')).toBe(false);
    fixture.componentRef.setInput('format', 'block');
    fixture.detectChanges();
    expect(el().classList.contains('block')).toBe(true);
  });

  /** La bande : un format de plus, lu sur l'hôte comme le bloc — simple par défaut. */
  it('le format bande se lit sur l’hôte, en simple par défaut', () => {
    fixture.componentRef.setInput('format', 'band');
    fixture.detectChanges();
    expect(el().classList.contains('band')).toBe(true);
    expect(el().classList.contains('block')).toBe(false);
    expect(el().classList.contains('double')).toBe(false);
    expect(action()).not.toBeNull();
  });

  it('la bande double se lit sur l’hôte', () => {
    fixture.componentRef.setInput('format', 'band');
    fixture.componentRef.setInput('bandSize', 'double');
    fixture.detectChanges();
    expect(el().classList.contains('band')).toBe(true);
    expect(el().classList.contains('double')).toBe(true);
  });

  /** « double » est une hauteur de BANDE : elle ne s'applique à aucun autre format. */
  it('la hauteur double est sans effet hors bande', () => {
    fixture.componentRef.setInput('bandSize', 'double');
    fixture.detectChanges();
    expect(el().classList.contains('double')).toBe(false);
  });
});
