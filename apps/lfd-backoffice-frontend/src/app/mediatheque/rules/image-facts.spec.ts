import { describe, expect, it } from 'vitest';

import {
  fileNameOf,
  formatBytes,
  formatContentType,
  formatDimensions,
  objectPositionOf,
} from './image-facts';

describe('ce qu’on sait d’une image', () => {
  it('dit les dimensions, et rien quand l’une manque', () => {
    expect(formatDimensions(4808, 3205)).toBe('4808 × 3205 px');
    expect(formatDimensions(null, 3205)).toBeNull();
  });

  it('dit les kilo-octets sous le méga, les méga-octets au-dessus', () => {
    expect(formatBytes(251_187)).toBe('245,3 Ko');
    expect(formatBytes(2_516_582)).toBe('2,4 Mo');
    expect(formatBytes(null)).toBeNull();
  });

  it('nomme le format par son sous-type, sans suffixe', () => {
    expect(formatContentType('image/jpeg')).toBe('JPEG');
    expect(formatContentType('image/svg+xml')).toBe('SVG');
    expect(formatContentType('')).toBeNull();
    expect(formatContentType(null)).toBeNull();
  });

  it('tire le nom du fichier de l’adresse, sans requête ni ancre', () => {
    expect(fileNameOf('https://media.test/products/abc.png?v=2#x')).toBe('abc.png');
    expect(fileNameOf('abc.png')).toBe('abc.png');
  });

  it('recadre au centre sans point, et suit le point au dixième', () => {
    expect(objectPositionOf(null)).toBe('50% 50%');
    expect(objectPositionOf({ x: 0.2, y: 0.756 })).toBe('20% 75.6%');
  });
});
