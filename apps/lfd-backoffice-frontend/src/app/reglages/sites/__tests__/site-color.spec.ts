import { describe, expect, it } from 'vitest';

import { normalizeSiteColor, siteColorIssue } from '../site-color';

/**
 * **La forme d'une couleur de site, jugée à la saisie** — la copie front de
 * `SiteColor` (serveur). Toute teinte passe, vert et rouge compris (Hugo,
 * 2026-10-13 : couleurs libres) ; seule la forme `#rrggbb` est jugée.
 */
describe('siteColorIssue', () => {
  it.each(['#0000ff', '#ffcc00', '#ff8000', '#808080', '#ff00ff', '#FFCC00'])(
    'laisse passer %s',
    (color) => {
      expect(siteColorIssue(color)).toBeNull();
    },
  );

  it.each(['#00ff00', '#2e8b57', '#ff0000', '#ff69b4'])(
    'laisse passer %s : aucune teinte réservée (Hugo, 2026-10-13)',
    (color) => {
      expect(siteColorIssue(color)).toBeNull();
    },
  );

  it.each(['bleu', '#fc0', '#ffcc0', '', '#gggggg'])(
    'dit que « %s » n’est pas #rrggbb',
    (value) => {
      expect(siteColorIssue(value)).toBe('format');
    },
  );

  it('normalise comme le serveur : sans blancs, en minuscules', () => {
    expect(normalizeSiteColor('  #FFCC00 ')).toBe('#ffcc00');
    expect(siteColorIssue('  #FFCC00 ')).toBeNull();
  });
});
