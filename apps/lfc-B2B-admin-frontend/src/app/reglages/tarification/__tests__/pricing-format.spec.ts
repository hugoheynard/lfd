import type { ElasticityComparison, ItemElasticityView, PricingItemView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  attainmentLabel,
  deltaLabel,
  formatLongDay,
  formatVariation,
  isDiscount,
  isOnTrack,
  ratioLabel,
  variationDirection,
} from '../pricing-format';

/**
 * **Trois cas où la bonne réponse est de ne RIEN afficher.**
 *
 * Un écart nul, un ratio infini, un objectif sans référence : dans chacun,
 * mettre un symbole obligerait le lecteur à décider s'il veut dire quelque
 * chose. C'est le fil de ce fichier.
 */

function item(canonicalCents: number, finalCents: number): PricingItemView {
  return {
    sku: 'VIE-001',
    name: 'Croissant',
    canonicalCents,
    ownFloor: null,
    effectiveFloor: null,
    rules: [],
    supersededRuleIds: [],
    steps: [],
    floored: false,
    finalCents,
    volumeTiers: [],
    elasticity: null,
    negotiationRoom: null,
  };
}

function elasticity(isoRevenueRatioBp: number | null): ItemElasticityView {
  return {
    fromCents: 200,
    toCents: 160,
    isoRevenueRatioBp,
    sinceChange: null,
    rolling: comparison(9_000),
  };
}

function comparison(attainmentBp: number | null): ElasticityComparison {
  const window = { from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T00:00:00.000Z', days: 30 };
  return {
    baseline: window,
    baselineVolume: 100,
    observed: window,
    observedVolume: 120,
    targetVolume: 125,
    attainmentBp,
    conclusive: true,
  };
}

describe("l'écart de prix", () => {
  it('dit une baisse avec un vrai signe moins', () => {
    expect(deltaLabel(item(200, 175))).toBe('−12,5 %');
    expect(isDiscount(item(200, 175))).toBe(true);
  });

  it('dit une hausse avec un plus', () => {
    expect(deltaLabel(item(200, 220))).toBe('+10,0 %');
    expect(isDiscount(item(200, 220))).toBe(false);
  });

  /** Un « 0 % » sur chaque ligne inchangée serait du bruit sur quatre-vingt-dix lignes. */
  it("ne dit rien quand le prix n'a pas bougé", () => {
    expect(deltaLabel(item(200, 200))).toBeNull();
  });

  /** Un article offert n'a pas de tarif d'entrée : il n'y a pas d'écart à dire. */
  it('ne dit rien sur un article à zéro', () => {
    expect(deltaLabel(item(0, 0))).toBeNull();
  });
});

describe("l'effort de volume", () => {
  it('rend le ratio iso-chiffre en clair', () => {
    expect(ratioLabel(elasticity(12_500))).toBe('×1,25');
  });

  /** « ×∞ » n'aide personne : un article offert n'atteint le chiffre à aucun volume. */
  it('se tait quand aucun volume ne compense', () => {
    expect(ratioLabel(elasticity(null))).toBeNull();
  });

  it("arrondit l'atteinte au pourcent entier", () => {
    expect(attainmentLabel(comparison(9_640))).toBe('96 %');
  });

  it('se tait quand il n’y a pas de référence pour juger', () => {
    expect(attainmentLabel(comparison(null))).toBeNull();
  });

  /**
   * Le seuil est à 100 % **inclus**, et il ne sert qu'à colorer : un objectif
   * manqué reste neutre à l'écran, sans quoi une remise récente ferait paniquer
   * avant d'avoir produit quoi que ce soit.
   */
  it("tient l'objectif à 100 % pile", () => {
    expect(isOnTrack(comparison(10_000))).toBe(true);
    expect(isOnTrack(comparison(9_999))).toBe(false);
    expect(isOnTrack(comparison(null))).toBe(false);
  });
});

/**
 * **Les trois mises en forme de la frise**, sorties du composant.
 *
 * Elles y vivaient en méthodes, donc n'étaient éprouvées que par les gabarits
 * qui les appellent — c'est-à-dire pas du tout sur les cas limites, qui sont
 * précisément ceux qui comptent : la variation incalculable, et le fuseau.
 */
describe('les variations en clair', () => {
  it('porte le sens par un signe, jamais par la couleur seule', () => {
    expect(formatVariation(-1_250)).toBe('−12,5 %');
    expect(formatVariation(1_250)).toBe('+12,5 %');
    expect(formatVariation(0)).toBe('0,0 %');
  });

  /** Partir de zéro n'est pas une variation, c'est une apparition. */
  it('refuse d’inventer un chiffre quand la variation ne se calcule pas', () => {
    expect(formatVariation(null)).toBe('—');
    expect(variationDirection(null)).toBe('flat');
  });

  it('range zéro avec le plat, pas avec la hausse', () => {
    expect(variationDirection(0)).toBe('flat');
    expect(variationDirection(1)).toBe('up');
    expect(variationDirection(-1)).toBe('down');
  });
});

describe('la date d’un titre', () => {
  /**
   * Rendue en UTC comme le jour qu'elle reçoit. Sans ce fuseau explicite, un
   * navigateur à l'ouest de Greenwich titrerait la veille de ce qu'il affiche.
   */
  it('rend le jour reçu, sans glisser d’un fuseau', () => {
    expect(formatLongDay('2026-09-12')).toBe('12 septembre 2026');
    expect(formatLongDay('2026-01-01')).toBe('1 janvier 2026');
  });
});
