import {
  coordinatesIssueOf,
  EMPTY_POSTAL_ADDRESS,
  formatCoordinates,
  formatPostalInline,
  parseCoordinates,
  postalIssueOf,
  postalLines,
} from '../address.model';
import { countryOptions } from '../countries';

const PARIS = {
  ...EMPTY_POSTAL_ADDRESS,
  label: 'Siège',
  line1: '12 rue de la Paix',
  postalCode: '75002',
  city: 'Paris',
  country: 'France',
};

describe('postalLines', () => {
  it('saute le complément vide plutôt que de laisser un trou', () => {
    expect(postalLines(PARIS)).toEqual(['12 rue de la Paix', '75002 Paris', 'France']);
  });

  it("n'écrit pas le nom d'usage : c'est un titre, pas une ligne postale", () => {
    expect(postalLines(PARIS)).not.toContain('Siège');
  });

  it('met le complément à sa place, entre la voie et la localité', () => {
    expect(postalLines({ ...PARIS, line2: 'Bâtiment B' })).toEqual([
      '12 rue de la Paix',
      'Bâtiment B',
      '75002 Paris',
      'France',
    ]);
  });

  it('formatPostalInline joint les mêmes lignes', () => {
    expect(formatPostalInline(PARIS)).toBe('12 rue de la Paix, 75002 Paris, France');
  });
});

describe('postalIssueOf', () => {
  it('exige voie, code postal et ville', () => {
    expect(postalIssueOf(PARIS)).toBe('');
    expect(postalIssueOf({ ...PARIS, city: '  ' })).not.toBe('');
  });
});

describe('coordinatesIssueOf', () => {
  it('accepte les deux vides', () => {
    expect(coordinatesIssueOf(PARIS)).toBe('');
  });

  it('refuse une moitié de point', () => {
    expect(coordinatesIssueOf({ ...PARIS, latitude: '48.8566' })).toMatch(/latitude ET/u);
  });

  it('refuse un point hors limites', () => {
    expect(coordinatesIssueOf({ ...PARIS, latitude: '91', longitude: '2' })).toMatch(/limites/u);
  });
});

describe('parseCoordinates', () => {
  it('lit ce qu’on colle depuis une carte', () => {
    expect(parseCoordinates('48.8566, 2.3522')).toEqual({
      latitude: '48.8566',
      longitude: '2.3522',
    });
  });

  it('accepte l’espace et le point-virgule comme séparateurs', () => {
    expect(parseCoordinates('48.8566 2.3522')).toEqual({
      latitude: '48.8566',
      longitude: '2.3522',
    });
    expect(parseCoordinates('-48.8566;-2.3522')).toEqual({
      latitude: '-48.8566',
      longitude: '-2.3522',
    });
  });

  it("rend null sur une frappe en cours plutôt que d'effacer sous les doigts", () => {
    expect(parseCoordinates('48.85')).toBeNull();
    expect(parseCoordinates('48.85, ')).toBeNull();
    expect(parseCoordinates('quelque part')).toBeNull();
  });

  it('rend null hors limites', () => {
    expect(parseCoordinates('200, 2')).toBeNull();
  });

  it('fait l’aller-retour avec formatCoordinates', () => {
    const point = parseCoordinates('48.8566, 2.3522');
    expect(point).not.toBeNull();
    expect(formatCoordinates({ ...PARIS, ...point })).toBe('48.8566, 2.3522');
  });

  it('formatCoordinates ne rend rien tant que le point est incomplet', () => {
    expect(formatCoordinates({ ...PARIS, latitude: '48.8566' })).toBe('');
  });
});

describe('countryOptions', () => {
  it('nomme les pays dans la langue demandée, triés dans cette langue', () => {
    const fr = countryOptions('fr');
    expect(fr.map((option) => option.label)).toContain('France');
    expect(fr[0]?.label).toBe('Afghanistan');
  });

  it('ne garde aucun code non traduit', () => {
    expect(countryOptions('fr').every((option) => option.label.length > 2)).toBe(true);
  });

  it("propose la valeur qu'un formulaire enregistre — le nom, pas le code", () => {
    const france = countryOptions('fr').find((option) => option.label === 'France');
    expect(france?.value).toBe('France');
  });
});
