import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { type GallerySlot, MediaGallery } from './media-gallery';

function render(slots: readonly GallerySlot[]): HTMLElement {
  const fixture = TestBed.createComponent(MediaGallery);
  fixture.componentRef.setInput('slots', slots);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function badges(host: HTMLElement): number {
  return host.querySelectorAll('.media-caption fold-badge.media-unpublished').length;
}

const slot = (role?: string): GallerySlot => ({ url: '', name: 'croissant', role });

describe('MediaGallery — usage non publié', () => {
  it('une image en galerie se dit non publiée', () => {
    // Régression (2026-10-10) : un croissant en `gallery` était invisible en
    // boutique, et la tuile n'en disait rien.
    const host = render([slot('gallery')]);
    expect(badges(host)).toBe(1);
    expect(host.querySelector('.media-unpublished')?.textContent).toContain('Non publié');
  });

  it("ne marque ni l'ouverture ni la vignette de rayon", () => {
    expect(badges(render([slot('hero'), slot('thumbnail')]))).toBe(0);
  });

  it("ne dit rien d'un visuel sans rôle — une famille n'en a pas la notion", () => {
    expect(badges(render([slot()]))).toBe(0);
  });

  it("pose la pastille dans la légende, jamais sur l'aperçu", () => {
    const host = render([slot('print')]);
    expect(host.querySelector('.media-thumb .media-unpublished')).toBeNull();
    expect(badges(host)).toBe(1);
  });
});

describe('MediaGallery — format signalé', () => {
  const gaps = (host: HTMLElement): number =>
    host.querySelectorAll('.media-caption fold-badge.media-format-gap').length;
  const sized = (role: string, width: number, height: number): GallerySlot => ({
    url: '',
    name: 'croissant',
    role,
    width,
    height,
  });

  it('marque un 3/2 posé en ouverture', () => {
    const host = render([sized('hero', 3000, 2000)]);
    expect(gaps(host)).toBe(1);
    expect(host.querySelector('.media-format-gap')?.textContent).toContain('Format');
  });

  it('ne marque ni une image au format, ni la galerie, ni une image non mesurée', () => {
    expect(
      gaps(render([sized('hero', 1600, 1200), sized('gallery', 3000, 1000), slot('hero')])),
    ).toBe(0);
  });
});
