import type { LayerSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';

import { glyphsUrlOf, type MapPalette, mapStyleOf } from './delivery-map-style';

const PALETTE: MapPalette = {
  land: 'rgba(1, 1, 1, 1)',
  wood: 'rgba(2, 2, 2, 1)',
  grass: 'rgba(3, 3, 3, 1)',
  ice: 'rgba(4, 4, 4, 1)',
  built: 'rgba(5, 5, 5, 1)',
  water: 'rgba(6, 6, 6, 1)',
  road: 'rgba(7, 7, 7, 1)',
  roadMajor: 'rgba(8, 8, 8, 1)',
  shade: 'rgba(9, 9, 9, 1)',
  light: 'rgba(10, 10, 10, 1)',
  halo: 'rgba(11, 11, 11, 1)',
  label: 'rgba(12, 12, 12, 1)',
  labelMinor: 'rgba(13, 13, 13, 1)',
};

function layers(): readonly LayerSpecification[] {
  return mapStyleOf(PALETTE, 'pmtiles://rues', 'pmtiles://relief', 'glyphes', []).layers;
}

describe('le style de la carte', () => {
  it('sert les glyphes depuis le back-office, gabarit MapLibre intact', () => {
    expect(glyphsUrlOf('https://bo.example/app/')).toBe(
      'https://bo.example/app/map-glyphs/{fontstack}/{range}.pbf',
    );
    expect(mapStyleOf(PALETTE, 'a', 'b', 'glyphes', []).glyphs).toBe('glyphes');
  });

  it('nomme lieux, sommets et rues, en lisant `name:latin` — le seul nom de nos tuiles', () => {
    const symbols = layers().filter((layer) => layer.type === 'symbol');

    expect(symbols.map((layer) => layer.id)).toEqual([
      'street-names',
      'peak-names',
      'hamlet-names',
      'village-names',
      'town-names',
    ]);
    for (const layer of symbols) {
      expect(layer.layout?.['text-field']).toEqual(['get', 'name:latin']);
    }
    expect(symbols.find((layer) => layer.id === 'street-names')?.minzoom).toBe(14);
  });

  it('dessine les noms SOUS les tracés des tournées', () => {
    const ids = layers().map((layer) => layer.id);

    expect(ids.indexOf('town-names')).toBeLessThan(ids.indexOf('halo'));
    expect(ids.indexOf('street-names')).toBeLessThan(ids.indexOf('routes'));
  });
});

describe('les attributions de la carte', () => {
  it('sont des liens vers OpenStreetMap et vers les sources du relief', () => {
    const sources = mapStyleOf(PALETTE, 'a', 'b', 'glyphes', []).sources;
    const attributions = Object.values(sources).map((source) =>
      'attribution' in source ? (source.attribution ?? '') : '',
    );

    expect(attributions).toContain(
      '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© contributeurs OpenStreetMap</a>',
    );
    expect(attributions).toContain(
      '<a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">© Mapterhorn · IGN</a>',
    );
  });
});
