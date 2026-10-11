import { describe, expect, it } from 'vitest';

import { previewScale, scaleLabel } from './preview-scale';

describe('previewScale — l’aperçu dézoomé', () => {
  it('rend le bureau à 1280 px et le réduit à la colonne : 640 px → 0,5', () => {
    expect(previewScale('desktop', 640, 600)).toEqual({
      frameWidth: 1280,
      frameHeight: 1200,
      k: 0.5,
      boxWidth: 640,
      boxHeight: 600,
    });
  });

  it('ne réduit pas le mobile quand la colonne est assez large', () => {
    expect(previewScale('mobile', 640, 600)).toMatchObject({
      frameWidth: 390,
      k: 1,
      boxWidth: 390,
    });
  });

  it('réduit le mobile seulement si la colonne est plus étroite', () => {
    expect(previewScale('mobile', 195, 600).k).toBe(0.5);
  });

  it('une colonne pas encore mesurée ne réduit rien', () => {
    expect(previewScale('desktop', 0, 600).k).toBe(1);
  });

  it('ne dit « réduit » que sous la taille réelle', () => {
    expect(scaleLabel(0.5)).toBe('Aperçu réduit à 50 %');
    expect(scaleLabel(1)).toBeNull();
  });
});
