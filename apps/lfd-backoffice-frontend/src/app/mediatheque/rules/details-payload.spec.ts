import type { LibraryMediaView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { panelDetails, tagsOnly } from './details-payload';

const ITEM: LibraryMediaView = {
  url: 'https://media.test/a.png',
  name: 'Croissant',
  tags: ['pain'],
  alt: { fr: 'Un croissant doré' },
  focal: { x: 0.2, y: 0.3 },
  uses: 1,
  depositedAt: '2026-10-04T22:05:00.000Z',
  series: null,
  palette: null,
  width: null,
  height: null,
  bytes: null,
  contentType: null,
};

describe('le corps d’une écriture', () => {
  /**
   * Régression : poser un mot depuis la bande effaçait la description — le
   * corps omettait l'alternative, que le serveur lit comme « effacée ».
   */
  it('ne touche que les mots-clés, et renvoie le reste inchangé', () => {
    expect(tagsOnly(ITEM, ['pain', 'beurre'])).toEqual({
      url: ITEM.url,
      name: 'Croissant',
      tags: ['pain', 'beurre'],
      alt: ITEM.alt,
      focal: ITEM.focal,
    });
  });

  it('écrit tout ce que le panneau rend, série comprise', () => {
    const result = {
      url: ITEM.url,
      name: 'Pain',
      alt: { fr: 'Une miche' },
      focal: null,
      tags: ['miche'],
      seriesId: 's1',
    };
    expect(panelDetails(ITEM, result)).toEqual({
      url: ITEM.url,
      name: 'Pain',
      tags: ['miche'],
      alt: { fr: 'Une miche' },
      focal: null,
      seriesId: 's1',
    });
  });

  it('omet une alternative vide plutôt que d’envoyer un texte sans langue', () => {
    const result = {
      url: ITEM.url,
      name: '',
      alt: { fr: '' },
      focal: null,
      tags: [],
      seriesId: null,
    };
    expect(panelDetails(ITEM, result)).not.toHaveProperty('alt');
  });
});
