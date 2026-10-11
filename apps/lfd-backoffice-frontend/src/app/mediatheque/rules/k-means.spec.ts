import { describe, expect, it } from 'vitest';

import { rgbToLab } from './color-math';
import { kMeans, type Sample } from './k-means';

function sample(r: number, g: number, b: number): Sample {
  return { lab: rgbToLab(r, g, b), r, g, b };
}

function repeat(value: Sample, times: number): Sample[] {
  return Array.from({ length: times }, () => value);
}

describe('le regroupement des couleurs', () => {
  it('ne rend rien pour aucun échantillon', () => {
    expect(kMeans([], 5)).toEqual([]);
  });

  it('ne fait pas plus de grappes que de couleurs distinctes', () => {
    const clusters = kMeans(repeat(sample(200, 10, 10), 20), 5);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.count).toBe(20);
  });

  it('met la plus grosse grappe en tête', () => {
    const samples = [...repeat(sample(0, 0, 255), 3), ...repeat(sample(255, 0, 0), 12)];
    const clusters = kMeans(samples, 2);
    expect(clusters.map((cluster) => cluster.count)).toEqual([12, 3]);
    expect(clusters[0]?.r).toBe(255);
  });

  it('est déterministe : les mêmes échantillons rendent les mêmes grappes', () => {
    const samples = [
      ...repeat(sample(10, 200, 10), 5),
      ...repeat(sample(250, 250, 0), 7),
      ...repeat(sample(20, 20, 20), 4),
    ];
    expect(kMeans(samples, 3)).toEqual(kMeans(samples, 3));
  });
});
