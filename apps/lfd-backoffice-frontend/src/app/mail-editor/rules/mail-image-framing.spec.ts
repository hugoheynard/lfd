import { describe, expect, it } from 'vitest';

import { focalLabel, imageFramingStyle, nudgedFocal } from './mail-image-framing';

describe('le cadrage d’une image vu par l’écran', () => {
  it('déplace le repère d’un vingtième par flèche, borné à l’image, depuis le centre', () => {
    expect(nudgedFocal(undefined, 'ArrowLeft')).toEqual({ x: 0.45, y: 0.5 });
    expect(nudgedFocal({ x: 0.3, y: 0.3 }, 'ArrowDown')).toEqual({ x: 0.3, y: 0.35 });
    expect(nudgedFocal({ x: 1, y: 0 }, 'ArrowRight')).toEqual({ x: 1, y: 0 });
    expect(nudgedFocal({ x: 1, y: 0 }, 'ArrowUp')).toEqual({ x: 1, y: 0 });
    expect(nudgedFocal(undefined, 'Enter')).toBeNull();
  });

  it('dit la position en clair', () => {
    expect(focalLabel(undefined)).toBe('50 % depuis la gauche, 50 % depuis le haut');
    expect(focalLabel({ x: 0.2, y: 0.75 })).toBe('20 % depuis la gauche, 75 % depuis le haut');
  });

  it('recadre en CSS un format qui recadre, autour du point focal', () => {
    expect(imageFramingStyle('2:1', '0.25', '1')).toEqual({
      aspectRatio: '2',
      objectPosition: '25% 100%',
    });
    expect(imageFramingStyle('3:2', null, null)?.objectPosition).toBe('50% 50%');
  });

  it('ne recadre ni l’originale ni un format inconnu, et un point illisible retombe au centre', () => {
    expect(imageFramingStyle('original', '0.2', '0.2')).toBeNull();
    expect(imageFramingStyle('4:3', '0.2', '0.2')).toBeNull();
    expect(imageFramingStyle(null, null, null)).toBeNull();
    expect(imageFramingStyle('1:1', '2', 'abc')?.objectPosition).toBe('50% 50%');
  });
});
