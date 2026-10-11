import { describe, expect, it } from 'vitest';

import { deltaE76, hexToLab, hexToRgb, rgbToHex, rgbToLab } from './color-math';

describe('les maths de la couleur', () => {
  it('rend le blanc et le noir de référence en Lab', () => {
    const white = rgbToLab(255, 255, 255);
    expect(white.l).toBeCloseTo(100, 1);
    expect(white.a).toBeCloseTo(0, 1);
    expect(white.b).toBeCloseTo(0, 1);
    expect(rgbToLab(0, 0, 0).l).toBeCloseTo(0, 5);
  });

  it('place le rouge sRGB à sa valeur Lab connue', () => {
    const red = rgbToLab(255, 0, 0);
    expect(red.l).toBeCloseTo(53.24, 1);
    expect(red.a).toBeCloseTo(80.09, 0);
    expect(red.b).toBeCloseTo(67.2, 0);
  });

  it('fait l’aller-retour hexadécimal, en minuscules et borné', () => {
    expect(hexToRgb('#1a2b3c')).toEqual([26, 43, 60]);
    expect(rgbToHex(26, 43, 60)).toBe('#1a2b3c');
    expect(rgbToHex(300, -4, 254.6)).toBe('#ff00ff');
  });

  it('mesure une distance nulle entre une couleur et elle-même', () => {
    expect(deltaE76(hexToLab('#808080'), rgbToLab(128, 128, 128))).toBe(0);
    expect(deltaE76(hexToLab('#000000'), hexToLab('#ffffff'))).toBeCloseTo(100, 1);
  });
});
