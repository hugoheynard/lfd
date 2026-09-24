import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { ClientLocale } from '../../../client-locale.service';
import { FR } from '../../../copy/fr';
import { StorefrontActions } from '../storefront-actions';
import { NOEL } from '../storefront.fixture';
import { InfoCard } from './info-card';

describe('InfoCard', () => {
  let fixture: ComponentFixture<InfoCard>;
  let actions: StorefrontActions;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (selector: string): string | undefined =>
    el().querySelector(selector)?.textContent?.trim();

  function render(inputs: Record<string, unknown> = {}): void {
    fixture = TestBed.createComponent(InfoCard);
    const all = {
      content: NOEL,
      shape: 'tile',
      mediaFit: 'cover',
      mediaSide: 'left',
      tone: 'dark',
      ...inputs,
    };
    for (const [name, value] of Object.entries(all)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [InfoCard], providers: [StorefrontActions] });
    actions = TestBed.inject(StorefrontActions);
    render();
  });

  it('montre la pastille, le titre, la phrase et l’image, en français par défaut', () => {
    expect(text('.badge')).toBe('Noël · J‑18');
    expect(text('.title')).toBe('Le rayon de Noël');
    expect(text('.lede')).toBe('Bûches et papillotes.');
    const img = el().querySelector('img');
    expect(img?.getAttribute('alt')).toBe('Une bûche');
    expect(img?.getAttribute('src')).toContain('buche.jpg');
  });

  it('parle la langue du visiteur, et retombe sur le français là où la traduction manque', () => {
    TestBed.inject(ClientLocale).current.set('en');
    fixture.detectChanges();

    expect(text('.title')).toBe('The Christmas shelf');
    expect(text('.badge')).toBe('Christmas · D‑18');
    // Pas d'anglais pour la phrase : le français, jamais un vide.
    expect(text('.lede')).toBe('Bûches et papillotes.');
  });

  it('une traduction vide vaut une traduction absente', () => {
    render({ content: { ...NOEL, title: { fr: 'Noël', it: '  ' } } });
    TestBed.inject(ClientLocale).current.set('it');
    fixture.detectChanges();

    expect(text('.title')).toBe('Noël');
  });

  it('ouvre le rayon lié, par son seul bouton', () => {
    const opened: string[] = [];
    actions.shelfOpened.subscribe((key) => opened.push(key));

    const button = el().querySelector<HTMLButtonElement>('button');
    expect(button?.textContent?.trim()).toBe(FR.shop.openFeatureShelf);
    button?.click();

    expect(opened).toEqual(['cat_patis']);
  });

  /** Une carte `role="button"` qui ne mène nulle part mentirait : sans rayon, pas de geste. */
  it('sans rayon lié, n’offre aucun bouton', () => {
    render({ content: { ...NOEL, linkShelfKey: null, badge: null, lede: null } });

    expect(el().querySelector('button')).toBeNull();
    expect(el().querySelector('.badge')).toBeNull();
    expect(el().querySelector('.lede')).toBeNull();
    expect(text('.title')).toBe('Le rayon de Noël');
  });

  it('porte sa forme, son côté effectif et son ton en classes d’hôte', () => {
    expect(el().className).toContain('shape-tile');
    expect(el().className).toContain('side-left');
    expect(el().className).toContain('tone-dark');
  });

  it('un côté que la forme ne permet pas retombe sur celui de la forme', () => {
    // Une tuile n'a pas de « haut » : son défaut est la gauche.
    render({ mediaSide: 'top' });
    expect(el().className).toContain('side-left');
  });

  it('marque les formes de plusieurs rangées, et le cadrage « contenir »', () => {
    render({ shape: 'block', mediaSide: 'top', mediaFit: 'contain' });

    expect(el().className).toContain('tall');
    expect(el().className).toContain('side-top');
    expect(el().className).toContain('contain');
  });

  /** Une info n'est pas un produit : le ton se voit, même sur une carte 1×1. */
  it('garde son ton sur une carte 1×1', () => {
    render({ shape: 'card', mediaSide: 'top', tone: 'accent' });
    expect(el().className).toContain('tone-accent');
  });

  describe('liée à une opération (D11)', () => {
    const LINKED = {
      ...NOEL,
      badge: null,
      linkShelfKey: null,
      operationKey: 'noel-2026',
      action: 'operation' as const,
      operation: {
        key: 'noel-2026',
        state: 'closed' as const,
        orderFrom: '2026-11-14T23:00:00.000Z',
        orderUntil: '2026-12-21T11:00:00.000Z',
        pickupFrom: '2026-12-20',
        pickupUntil: '2026-12-24',
      },
    };

    it('ouvre le rayon `op:<key>`, comme une pastille de rayon', () => {
      const opened: string[] = [];
      actions.shelfOpened.subscribe((key) => opened.push(key));
      render({ content: LINKED });

      el().querySelector<HTMLButtonElement>('button')?.click();

      expect(opened).toEqual(['op:noel-2026']);
    });

    it('sans pastille saisie, calcule la sienne depuis l’état de l’opération', () => {
      render({ content: LINKED });
      expect(text('.badge')).toBe(FR.shop.operationClosed);
    });

    it('une pastille saisie l’emporte sur la pastille calculée', () => {
      render({ content: { ...LINKED, badge: { fr: 'Bientôt' } } });
      expect(text('.badge')).toBe('Bientôt');
    });

    it('l’action « aucune » n’offre aucun bouton, même avec un rayon', () => {
      render({ content: { ...NOEL, action: 'none' } });
      expect(el().querySelector('button')).toBeNull();
    });
  });
});
