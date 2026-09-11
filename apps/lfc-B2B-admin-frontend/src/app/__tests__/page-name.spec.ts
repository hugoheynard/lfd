import { describe, expect, it } from 'vitest';

import { pageNameOf } from '../page-name';

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
