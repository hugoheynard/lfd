import { describe, expect, it } from 'vitest';
import type { TrafficSample } from '@lfd/ops-contract';

import { sparklineOf } from '../sparkline';

const sample = (requests: number, failures = 0): TrafficSample => ({
  at: '2026-08-19T12:00:00.000Z',
  requests,
  failures,
});

describe('sparklineOf', () => {
  it('ne dessine rien sous deux points', () => {
    // Une courbe d'un seul point n'est pas une courbe, c'est un point — et la
    // dessiner suggérerait une histoire là où il n'y a qu'une mesure.
    expect(sparklineOf([sample(10)], 64, 12)).toBeNull();
    expect(sparklineOf([], 64, 12)).toBeNull();
  });

  it('pose le sommet en haut et le creux en bas', () => {
    const spark = sparklineOf([sample(0), sample(100)], 64, 12);

    // L'aire est fermée sur la ligne de base, et le maximum touche le plafond.
    expect(spark?.area).toContain('L 0 12');
    expect(spark?.area).toContain('L 64 0');
  });

  it("souligne le DERNIER point, parce que c'est « maintenant »", () => {
    const spark = sparklineOf([sample(100), sample(50)], 64, 12);

    expect(spark?.tip).toEqual({ x: 64, y: 6 });
  });

  it("n'émet aucun trait d'échecs quand il n'y en a pas", () => {
    // Un trait à zéro collé à la ligne de base se lirait comme une mesure, pas
    // comme une absence d'incident.
    expect(sparklineOf([sample(10), sample(20)], 64, 12)?.failures).toBeNull();
  });

  it('donne aux échecs leur PROPRE échelle', () => {
    // Sur celle du volume — deux ordres de grandeur au-dessus — le trait serait
    // écrasé sur la ligne de base et invisible. On y cherche une bosse, pas une
    // valeur : un pic d'échecs monte donc jusqu'en haut de la vignette.
    const spark = sparklineOf([sample(1000, 0), sample(1000, 3)], 64, 12);

    expect(spark?.failures).toBe('M 0 12 L 64 0');
  });

  it('survit à une période entièrement vide', () => {
    // Zéro requête partout : diviser par le maximum ferait un NaN, et un `NaN`
    // dans un attribut `d` fait disparaître le tracé sans rien dire.
    const spark = sparklineOf([sample(0), sample(0)], 64, 12);

    expect(spark?.area).not.toContain('NaN');
  });
});
