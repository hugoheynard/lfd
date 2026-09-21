import { describe, expect, it } from 'vitest';

import { discountToRatioBp, formatDiscount, ratioBpToDiscount } from '../pro-discount';

describe('discountToRatioBp', () => {
  it('traduit la remise saisie en rapport stocké', () => {
    expect(discountToRatioBp(10)).toBe(9_000);
    expect(discountToRatioBp(12.5)).toBe(8_750);
    expect(discountToRatioBp(0)).toBe(10_000);
  });

  /**
   * 100 % de remise donnerait un prix professionnel nul — la base le refuse
   * (`pro_price_ratio_bp > 0`), et un aperçu qui l'accepterait promettrait une
   * écriture impossible.
   */
  it('refuse 100 % — un prix pro nul n’est pas une remise', () => {
    expect(discountToRatioBp(100)).toBeNull();
    expect(discountToRatioBp(150)).toBeNull();
  });

  it('refuse le négatif — le pro ne paie pas plus cher', () => {
    expect(discountToRatioBp(-5)).toBeNull();
  });

  /**
   * Rendre `null` plutôt que corriger en silence : l'écran doit désactiver son
   * bouton, pas enregistrer autre chose que ce qui est écrit.
   */
  it('refuse ce qui n’est pas un nombre', () => {
    expect(discountToRatioBp(Number.NaN)).toBeNull();
    expect(discountToRatioBp(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('ratioBpToDiscount', () => {
  it('fait l’aller-retour sans perte sur deux décimales', () => {
    for (const discount of [0, 5, 10, 12.5, 33.33, 99.99]) {
      const ratioBp = discountToRatioBp(discount);
      expect(ratioBp).not.toBeNull();
      expect(ratioBpToDiscount(ratioBp ?? 0)).toBe(discount);
    }
  });
});

describe('formatDiscount', () => {
  it('écrit la remise avec son signe et la virgule française', () => {
    expect(formatDiscount(9_000)).toBe('−10 %');
    expect(formatDiscount(8_750)).toBe('−12,5 %');
  });

  /** « −0 % » se lit comme une erreur ; un rapport à 100 % est un choix. */
  it('nomme le rapport à 100 % au lieu d’écrire « −0 % »', () => {
    expect(formatDiscount(10_000)).toBe('aucune remise');
  });
});
