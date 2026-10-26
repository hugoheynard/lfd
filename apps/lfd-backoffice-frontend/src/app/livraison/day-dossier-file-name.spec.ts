import { dayDossierFileName } from './day-dossier-file-name';

describe('dayDossierFileName', () => {
  it('dit le jour, le mois en toutes lettres et l’année', () => {
    expect(dayDossierFileName('2026-10-26')).toBe('dossier-de-livraison-du-26-octobre-2026.pdf');
  });

  it('ôte le zéro du jour et les accents du mois', () => {
    expect(dayDossierFileName('2027-02-03')).toBe('dossier-de-livraison-du-3-fevrier-2027.pdf');
    expect(dayDossierFileName('2027-08-01')).toBe('dossier-de-livraison-du-1-aout-2027.pdf');
    expect(dayDossierFileName('2027-12-31')).toBe('dossier-de-livraison-du-31-decembre-2027.pdf');
  });
});
