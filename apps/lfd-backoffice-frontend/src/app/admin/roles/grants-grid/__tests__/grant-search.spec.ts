import { describe, expect, it } from 'vitest';

import { highlightSegments, matchesTerm, normalizeTerm } from '../grant-search';

describe('grant-search — la correspondance', () => {
  it('ignore la casse et les accents, dans les deux sens', () => {
    expect(matchesTerm('Légal', 'legal')).toBe(true);
    expect(matchesTerm('Legal', 'LÉGAL')).toBe(true);
    expect(matchesTerm('Équipe et accès', 'equipe')).toBe(true);
  });

  it('ignore les espaces en trop autour et entre les mots', () => {
    expect(normalizeTerm('  Équipe    et  ')).toBe('equipe et');
    expect(matchesTerm('Équipe et accès', '  equipe   et ')).toBe(true);
  });

  it('un terme vide ou blanc correspond à tout', () => {
    expect(matchesTerm('Légal', '')).toBe(true);
    expect(matchesTerm('Légal', '   ')).toBe(true);
  });

  it('refuse ce qui n’est pas dans le texte', () => {
    expect(matchesTerm('Légal', 'tournée')).toBe(false);
  });
});

describe('grant-search — le découpage du surlignage', () => {
  it('surligne l’orthographe d’origine, pas celle tapée', () => {
    expect(highlightSegments('Le légal', 'LEGAL')).toEqual([
      { text: 'Le ', match: false },
      { text: 'légal', match: true },
    ]);
  });

  it('surligne chaque occurrence', () => {
    expect(highlightSegments('Prix, prix et PRIX', 'prix')).toEqual([
      { text: 'Prix', match: true },
      { text: ', ', match: false },
      { text: 'prix', match: true },
      { text: ' et ', match: false },
      { text: 'PRIX', match: true },
    ]);
  });

  it('un terme vide rend le texte entier, non surligné', () => {
    expect(highlightSegments('Légal', '  ')).toEqual([{ text: 'Légal', match: false }]);
    expect(highlightSegments('', 'x')).toEqual([]);
  });

  it('un texte sans le terme reste d’un seul morceau', () => {
    expect(highlightSegments('Fournil', 'légal')).toEqual([{ text: 'Fournil', match: false }]);
  });

  it('tient un caractère décomposé (e + accent combinant)', () => {
    expect(highlightSegments('légal ok', 'legal')).toEqual([
      { text: 'légal', match: true },
      { text: ' ok', match: false },
    ]);
  });
});
