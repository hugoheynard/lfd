import { serviceDayLabel } from './format-day';

// Les jours ne sont comparés qu'entre eux (`today` est un argument) : aucun ne
// se confronte à l'horloge, ils peuvent rester absolus.
const TODAY = '2026-09-15';
const NEAR = { today: 'aujourd’hui', tomorrow: 'demain' };

describe('serviceDayLabel', () => {
  it('dit « aujourd’hui » et « demain » d’un mot', () => {
    expect(serviceDayLabel('2026-09-15', TODAY, 'fr', NEAR)).toBe('aujourd’hui');
    expect(serviceDayLabel('2026-09-16', TODAY, 'fr', NEAR)).toBe('demain');
  });

  /** Régression : le panier annonçait « demain » pour une journée au surlendemain. */
  it('écrit la date au-delà de demain, dans la langue choisie', () => {
    expect(serviceDayLabel('2026-09-17', TODAY, 'fr', NEAR)).toBe('jeudi 17 septembre');
    expect(serviceDayLabel('2026-09-17', TODAY, 'en', NEAR)).toBe('Thursday, September 17');
  });

  it('passe le changement de mois', () => {
    expect(serviceDayLabel('2026-10-01', '2026-09-30', 'fr', NEAR)).toBe('demain');
  });

  it('rend une date illisible telle quelle', () => {
    expect(serviceDayLabel('bientôt', TODAY, 'fr', NEAR)).toBe('bientôt');
  });
});
