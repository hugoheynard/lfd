import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { StorefrontContent } from '@lfd/contracts';
import type { ComposedCarousel } from '@lfd/storefront-layout';
import { vi } from 'vitest';

import { StorefrontActions } from '../storefront-actions';
import { NOEL } from '../storefront.fixture';
import { StorefrontSlot } from './storefront-slot';

const PAQUES: StorefrontContent = { ...NOEL, title: { fr: 'Pâques' } };
const FETE: StorefrontContent = { ...NOEL, title: { fr: 'Fête du pain' } };

const AUTO: ComposedCarousel = { nav: 'both', autoplay: true, intervalSeconds: 5, firstSeconds: 8 };

/** Ce que `matchMedia` répond à la question du mouvement réduit. */
function motionReduced(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced, media: query }));
}

describe('StorefrontSlot', () => {
  let fixture: ComponentFixture<StorefrontSlot>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const current = (): string | undefined =>
    el().querySelector('.slide.current .title')?.textContent?.trim();
  const buttons = (): HTMLButtonElement[] => Array.from(el().querySelectorAll('.controls button'));

  async function render(
    contents: readonly StorefrontContent[],
    carousel: ComposedCarousel | null,
  ): Promise<void> {
    fixture = TestBed.createComponent(StorefrontSlot);
    fixture.componentRef.setInput('contents', contents);
    fixture.componentRef.setInput('carousel', carousel);
    fixture.componentRef.setInput('shape', 'tile');
    fixture.componentRef.setInput('mediaFit', 'cover');
    fixture.componentRef.setInput('mediaSide', 'left');
    fixture.componentRef.setInput('tone', 'dark');
    fixture.detectChanges();
    await fixture.whenStable();
  }

  /** Avance l'horloge, puis laisse l'écran suivre. */
  async function wait(seconds: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(seconds * 1000);
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    motionReduced(false);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [StorefrontSlot], providers: [StorefrontActions] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('un seul contenu : le rendu du registre, sans commande', async () => {
    await render([NOEL], null);

    expect(el().querySelector('app-info-card')).not.toBeNull();
    expect(current()).toBe('Le rayon de Noël');
    expect(buttons()).toHaveLength(0);
  });

  it('plusieurs contenus : un seul visible, les autres cachés aux lecteurs d’écran', async () => {
    await render([NOEL, PAQUES, FETE], { ...AUTO, autoplay: false });

    expect(el().querySelectorAll('.slide')).toHaveLength(3);
    expect(el().querySelectorAll('.slide[aria-hidden="true"]')).toHaveLength(2);
    expect(current()).toBe('Le rayon de Noël');
  });

  it('les flèches bouclent dans les deux sens, les points vont droit au contenu', async () => {
    await render([NOEL, PAQUES, FETE], { ...AUTO, autoplay: false });
    // Flèche, trois points, flèche.
    expect(buttons()).toHaveLength(5);

    buttons()[0]?.click();
    fixture.detectChanges();
    expect(current()).toBe('Fête du pain');

    buttons()[4]?.click();
    fixture.detectChanges();
    expect(current()).toBe('Le rayon de Noël');

    buttons()[2]?.click();
    fixture.detectChanges();
    expect(current()).toBe('Pâques');
    expect(buttons()[2]?.getAttribute('aria-current')).toBe('true');
  });

  it('« points » seuls : pas de flèche', async () => {
    await render([NOEL, PAQUES], { ...AUTO, nav: 'dots', autoplay: false });
    expect(buttons()).toHaveLength(2);
    expect(buttons()[1]?.getAttribute('aria-label')).toBe('Contenu 2 sur 2');
  });

  it('défile seul : le premier reste plus longtemps, puis chacun sa durée, puis le cycle reprend', async () => {
    await render([NOEL, PAQUES, FETE], AUTO);

    await wait(7);
    expect(current()).toBe('Le rayon de Noël');
    await wait(1);
    expect(current()).toBe('Pâques');
    await wait(5);
    expect(current()).toBe('Fête du pain');
    await wait(5);
    expect(current()).toBe('Le rayon de Noël');
  });

  it('se suspend au survol et reprend après', async () => {
    await render([NOEL, PAQUES], AUTO);
    const viewport = el().querySelector('.viewport');

    viewport?.dispatchEvent(new MouseEvent('mouseenter'));
    await wait(20);
    expect(current()).toBe('Le rayon de Noël');

    viewport?.dispatchEvent(new MouseEvent('mouseleave'));
    await wait(8);
    expect(current()).toBe('Pâques');
  });

  it('se suspend au focus clavier', async () => {
    await render([NOEL, PAQUES], AUTO);

    el().querySelector('.viewport')?.dispatchEvent(new FocusEvent('focusin'));
    await wait(20);
    expect(current()).toBe('Le rayon de Noël');
  });

  it('s’arrête pour de bon au premier toucher', async () => {
    await render([NOEL, PAQUES], AUTO);

    el().querySelector('.viewport')?.dispatchEvent(new Event('touchstart'));
    await wait(60);
    expect(current()).toBe('Le rayon de Noël');
  });

  it('ne démarre jamais sous « mouvement réduit »', async () => {
    motionReduced(true);
    await render([NOEL, PAQUES], AUTO);

    await wait(60);
    expect(current()).toBe('Le rayon de Noël');
  });

  it('ne défile pas quand l’objet ne le demande pas', async () => {
    await render([NOEL, PAQUES], { ...AUTO, autoplay: false });

    await wait(60);
    expect(current()).toBe('Le rayon de Noël');
  });
});
