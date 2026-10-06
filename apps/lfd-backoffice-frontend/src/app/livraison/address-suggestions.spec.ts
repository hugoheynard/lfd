import { describe, expect, it } from 'vitest';

import {
  coordinatesOf,
  kindLabelOf,
  mapHrefOf,
  suggestionKeyOf,
  suggestionSentenceOf,
} from './address-suggestions';
import { suggestionOf } from './address-suggestions.fixture';

describe('les mots de « Carnet à corriger » (§6)', () => {
  it('dit la porte, l’écart et le compte', () => {
    expect(suggestionSentenceOf(suggestionOf())).toBe(
      'La porte de livraison semble être à 120 m du point enregistré (4 livraisons concordantes).',
    );
  });

  it('dit le stationnement, et les arrivées', () => {
    expect(suggestionSentenceOf(suggestionOf({ kind: 'parking', concordant: 3 }))).toContain(
      'Le livreur semble se garer à 120 m',
    );
    expect(suggestionSentenceOf(suggestionOf({ kind: 'parking', concordant: 3 }))).toContain(
      '3 arrivées concordantes',
    );
  });

  it('dit le géocodage, et l’absence de point', () => {
    expect(suggestionSentenceOf(suggestionOf({ reference: 'geocode' }))).toContain(
      'de l’adresse géocodée',
    );
    expect(
      suggestionSentenceOf(suggestionOf({ reference: 'none', recorded: null, distanceM: null })),
    ).toContain('le carnet n’a aucun point pour cette adresse');
  });

  it('le libellé, la clé, les coordonnées', () => {
    expect(kindLabelOf(suggestionOf())).toBe('Porte');
    expect(kindLabelOf(suggestionOf({ kind: 'parking' }))).toBe('Stationnement');
    expect(suggestionKeyOf(suggestionOf({ kind: 'parking' }))).toBe('a1:parking');
    expect(coordinatesOf({ lat: 45.565, lng: 5.918 })).toBe('45.56500, 5.91800');
  });

  it('la carte : du point enregistré au point suggéré, à pied ; le point seul sinon', () => {
    expect(mapHrefOf(suggestionOf())).toBe(
      'https://www.google.com/maps/dir/?api=1&origin=45.565,5.918&destination=45.56608,5.918&travelmode=walking',
    );
    expect(mapHrefOf(suggestionOf({ recorded: null }))).toBe(
      'https://www.google.com/maps/search/?api=1&query=45.56608,5.918',
    );
  });
});
