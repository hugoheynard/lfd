import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { MediaSlot } from '../product-http-api';
import {
  flattenMediaImages,
  groupMediaByImage,
  persistedMedia,
  withMediaRoles,
} from '../media-usages';
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

const slot = (role?: string): GallerySlot => ({
  url: '',
  name: 'croissant',
  roles: role === undefined ? undefined : [role],
});

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

  it('ne marque pas une image publiée par un de ses usages, même en galerie aussi', () => {
    expect(badges(render([{ url: '', name: 'c', roles: ['gallery', 'hero'] }]))).toBe(0);
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
    roles: [role],
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

const flat = (url: string, role: string): MediaSlot => ({ role, url, name: url });

describe('MediaGallery — une image, plusieurs usages', () => {
  it('regroupe à la lecture : ouverture et vignette sur la même URL font UNE tuile', () => {
    // 150 fiches portent hero + thumbnail sur la même url depuis le 2026-10-17.
    const host = render(groupMediaByImage([flat('a', 'hero'), flat('a', 'thumbnail')]));
    expect(host.querySelectorAll('.media-tile')).toHaveLength(1);
    const roles = [...host.querySelectorAll('.media-roles fold-badge')].map((badge) =>
      badge.textContent?.trim(),
    );
    expect(roles).toEqual(['Ouverture', 'Vignette de rayon']);
  });

  it('rend exactement la même liste plate à l’aller-retour', () => {
    const read = [flat('a', 'hero'), flat('a', 'thumbnail'), flat('b', 'gallery')];
    expect(persistedMedia(flattenMediaImages(groupMediaByImage(read)))).toEqual(read);
  });

  it("cocher l'ouverture la retire de l'autre image, qui garde ses autres usages", () => {
    const images = groupMediaByImage([
      flat('a', 'hero'),
      flat('a', 'thumbnail'),
      flat('b', 'print'),
    ]);
    const after = withMediaRoles(images, 'b', ['print', 'hero']);
    expect(after.map((image) => image.roles)).toEqual([['thumbnail'], ['print', 'hero']]);
    expect(persistedMedia(flattenMediaImages(after)).filter((s) => s.role === 'hero')).toHaveLength(
      1,
    );
  });

  it("une image sans usage reste à l'écran, se dit, et ne s'enregistre pas", () => {
    const images = withMediaRoles(groupMediaByImage([flat('a', 'hero'), flat('b', 'hero')]), 'b', [
      'hero',
    ]);
    const host = render(images);
    expect(host.querySelectorAll('.media-tile')).toHaveLength(2);
    expect(host.querySelectorAll('fold-badge.media-unassigned')).toHaveLength(1);
    expect(persistedMedia(flattenMediaImages(images))).toEqual([flat('b', 'hero')]);
  });

  it("ne dit rien d'usage pour un porteur qui n'en a pas la notion", () => {
    const host = render([slot()]);
    expect(host.querySelector('.media-unassigned')).toBeNull();
    expect(host.querySelector('.media-roles')).toBeNull();
  });
});
