import { describe, expect, it } from 'vitest';

import { isPublishedMediaRole, PUBLISHED_MEDIA_ROLES } from './media-roles';

describe('media-roles', () => {
  it("publie l'ouverture et la vignette de rayon, et elles seules", () => {
    expect(PUBLISHED_MEDIA_ROLES).toEqual(['hero', 'thumbnail']);
    expect(isPublishedMediaRole('hero')).toBe(true);
    expect(isPublishedMediaRole('thumbnail')).toBe(true);
  });

  it('une image en galerie se dit non publiée', () => {
    // Régression (2026-10-10) : un croissant en `gallery` était invisible en
    // boutique, et rien à l'écran ne le disait.
    expect(isPublishedMediaRole('gallery')).toBe(false);
    expect(isPublishedMediaRole('lifestyle')).toBe(false);
    expect(isPublishedMediaRole('print')).toBe(false);
  });
});
