import { describe, expect, it } from 'vitest';

import { normalizeSiteColor, siteColorIssue } from '../site-color';

/**
 * **La teinte d'une couleur de site, jugée à la saisie** — la copie front de
 * `SiteColor` (serveur). Les cas sont ceux de la demande d'origine : bleu,
 * jaune, orange, gris permis ; vert, rouge, rose refusés.
 */
describe('siteColorIssue', () => {
  it.each(['#0000ff', '#ffcc00', '#ff8000', '#808080', '#ff00ff', '#FFCC00'])(
    'laisse passer %s',
    (color) => {
      expect(siteColorIssue(color)).toBeNull();
    },
  );

  it.each([
    ['#00ff00', 'le vert'],
    ['#2e8b57', 'un vert de mer'],
    ['#ff0000', 'le rouge'],
    ['#ff69b4', 'le rose'],
    ['#e6194b', 'un rouge framboise'],
  ])('refuse %s (%s), réservé aux surligneurs', (color) => {
    expect(siteColorIssue(color)).toBe('reserved');
  });

  it('laisse passer un gris à peine verdâtre : sous le seuil de saturation', () => {
    expect(siteColorIssue('#8a9a8a')).toBeNull();
  });

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
