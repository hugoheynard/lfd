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
