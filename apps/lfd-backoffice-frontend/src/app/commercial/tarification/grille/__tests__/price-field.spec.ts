import { describe, expect, it } from 'vitest';

import { millicentsField, millicentsOf } from '../price-field';

/**
 * Régression : ce module parlait CENTIMES alors que tous ses appelants lui
 * donnaient des millicentimes. Un prix tapé à 2,10 € entrait en base à
 * 0,0021 €, et une mercuriale antérieure à la migration du 2026-08-31 se
 * rouvrait à 3000,00 € (fix 2026-09-06, `D10`).
 */
describe('millicentsOf', () => {
  it('lit un prix en euros comme des MILLICENTIMES, pas des centimes', () => {
    // 2,10 € = 210 000 millicentimes. La valeur d'avant le correctif était 210,
    // soit 0,0021 € — le prix qui partait en base.
    expect(millicentsOf('2,10')).toBe(210_000);
  });

  it('accepte les cinq décimales — un prix se négocie comme ça', () => {
    expect(millicentsOf('2,13456')).toBe(213_456);
    expect(millicentsOf('0,00001')).toBe(1);
  });

  it('lit le point comme la virgule', () => {
    expect(millicentsOf('2.13456')).toBe(213_456);
  });

  /**
   * `Number.parseFloat('19,99') * 100_000` vaut `1998999.9999999998` en binaire.
   * Ce test échoue sur toute implémentation qui passe par un flottant sans
   * arrondir — et il tient même si quelqu'un retire l'arrondi.
   */
  it('est EXACT : aucune valeur ne passe par un flottant', () => {
    expect(millicentsOf('19,99')).toBe(1_999_000);
    expect(millicentsOf('8,18182')).toBe(818_182);
    expect(millicentsOf('1234,56789')).toBe(123_456_789);
  });

  it('arrondit la sixième décimale, la moitié s’éloignant de zéro', () => {
    expect(millicentsOf('2,134564')).toBe(213_456);
    expect(millicentsOf('2,134565')).toBe(213_457);
    expect(millicentsOf('2,1345649999')).toBe(213_456);
  });

  it('accepte les formes partielles qu’un champ traverse pendant la frappe', () => {
    expect(millicentsOf('2,')).toBe(200_000);
    expect(millicentsOf(',5')).toBe(50_000);
    expect(millicentsOf(' 2,10 ')).toBe(210_000);
  });

  it('refuse ce qui n’est pas un prix — et le vide n’est PAS un zéro', () => {
    expect(millicentsOf('')).toBeNull();
    expect(millicentsOf(',')).toBeNull();
    expect(millicentsOf('-1')).toBeNull();
    expect(millicentsOf('abc')).toBeNull();
    expect(millicentsOf('1e3')).toBeNull();
  });

  /**
   * La colonne qui reçoit ce prix est un `Int` Postgres : 21 474,83647 € est le
   * dernier prix représentable. Refuser ici le refuse là où quelqu'un peut le
   * corriger, plutôt qu'au `POST` d'une grille entière.
   */
  it('refuse ce que la colonne ne peut pas porter', () => {
    expect(millicentsOf('21474,83647')).toBe(2_147_483_647);
    expect(millicentsOf('21474,83648')).toBeNull();
  });
});

describe('millicentsField', () => {
  it('rend un prix rond avec DEUX décimales, pas cinq', () => {
    // Cinq décimales sur un prix rond le feraient passer pour un prix calculé.
    expect(millicentsField(210_000)).toBe('2,10');
    expect(millicentsField(0)).toBe('0,00');
  });

  it('garde les décimales qui existent, jusqu’à cinq', () => {
    expect(millicentsField(213_456)).toBe('2,13456');
    expect(millicentsField(7_000)).toBe('0,07');
    expect(millicentsField(1)).toBe('0,00001');
  });

  /**
   * Régression : c'est CE sens-là qui affichait 3000,00 € pour un gabarit
   * enregistré à 300 000 millicentimes — donc toute mercuriale antérieure à la
   * migration du 2026-08-31.
   */
  it('affiche un montant migré à sa vraie valeur', () => {
    expect(millicentsField(300_000)).toBe('3,00');
  });

  it('fait l’aller-retour avec la saisie, dans les deux sens', () => {
    for (const raw of ['2,10', '0,85', '2,13456', '0,00001', '21474,83647']) {
      expect(millicentsField(millicentsOf(raw) ?? -1)).toBe(
        raw.replace(/,(\d)$/u, ',$10').replace(/,00000$/u, ',00'),
      );
    }
    for (const millicents of [1, 7_000, 85_000, 210_000, 213_456, 300_000]) {
      expect(millicentsOf(millicentsField(millicents))).toBe(millicents);
    }
  });
});
