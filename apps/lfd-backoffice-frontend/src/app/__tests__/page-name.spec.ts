import { describe, expect, it } from 'vitest';

import { HEADER_SECTION, headerNameOf, headerSectionOf, pageNameOf } from '../page-name';

/**
 * Le titre d'une route sert DEUX lecteurs : l'onglet du navigateur, qui a
 * besoin du nom de l'application, et la barre de l'app, qui l'affiche déjà.
 * Cette fonction ne garde que ce que la barre n'a pas.
 */
describe('pageNameOf', () => {
  it('garde le nom de l’écran et laisse le suffixe', () => {
    expect(pageNameOf('File de remise — LFC B2B admin')).toBe('File de remise');
  });

  it('rend le titre tel quel quand il n’a pas de suffixe', () => {
    expect(pageNameOf('Tableau de bord')).toBe('Tableau de bord');
  });

  it('🔴 ne rend rien plutôt qu’une chaîne vide', () => {
    // Une route sans titre ne doit pas peindre un séparateur qui n'introduit
    // rien — « LFC PRO / » se lit comme un écran dont le nom n'a pas chargé.
    expect(pageNameOf(undefined)).toBeNull();
    expect(pageNameOf('')).toBeNull();
    expect(pageNameOf(' — LFC B2B admin')).toBeNull();
  });

  it('coupe au PREMIER tiret cadratin, pas au dernier', () => {
    expect(pageNameOf('Santé — écosystème — LFC B2B admin')).toBe('Santé');
  });
});

describe('headerNameOf', () => {
  it("écrit l'espace de travail quand il y en a un", () => {
    // Dans le Commercial, la vue est déjà nommée en tête du rail et dans le
    // bandeau : l'en-tête dit où l'on est, pas ce qu'on regarde.
    expect(headerNameOf('Commercial', 'Tableau de bord')).toBe('Commercial');
  });

  it("retombe sur l'écran hors de tout espace", () => {
    expect(headerNameOf(undefined, 'File de remise')).toBe('File de remise');
  });

  it('rend null quand ni espace ni titre', () => {
    expect(headerNameOf(undefined, null)).toBeNull();
  });
});

describe('headerSectionOf', () => {
  it('rend le nom déclaré par la route la plus proche de la feuille', () => {
    expect(
      headerSectionOf([{ data: {} }, { data: { [HEADER_SECTION]: 'Comptoir' } }, { data: {} }]),
    ).toBe('Comptoir');
  });

  it("rend null quand aucune route ne nomme d'espace", () => {
    expect(headerSectionOf([{ data: {} }, { data: { autre: 'x' } }])).toBeNull();
  });
});
