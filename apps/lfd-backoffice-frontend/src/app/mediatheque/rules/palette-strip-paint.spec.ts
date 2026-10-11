import type { PaletteStripColumnView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { paintStrip, type StripPainter } from './palette-strip-paint';

/** Un contexte qui retient ce qu'on y peint, rectangle par rectangle. */
class RecordingPainter implements StripPainter {
  fillStyle: StripPainter['fillStyle'] = '';
  readonly rects: { fill: string; x: number; y: number; w: number; h: number }[] = [];

  fillRect(x: number, y: number, w: number, h: number): void {
    this.rects.push({ fill: String(this.fillStyle), x, y, w, h });
  }
}

function column(palette: PaletteStripColumnView['palette']): PaletteStripColumnView {
  return {
    from: '2026-10-04T22:00:00.000Z',
    to: '2026-10-05T21:59:59.000Z',
    count: 1,
    palette,
    sampleUrl: 'https://img/a.png',
  };
}

const FRAME = { width: 20, height: 10, hatch: ['#eee', '#ccc'] };

describe('la peinture de la frise', () => {
  it('empile les dominantes à proportion de leur part, puis les écarts', () => {
    const painter = new RecordingPainter();

    paintStrip(
      painter,
      [
        column([
          { hex: '#ff0000', share: 0.75, outlier: false },
          { hex: '#0000ff', share: 0.25, outlier: false },
          { hex: '#00ff00', share: 0.01, outlier: true },
        ]),
      ],
      FRAME,
    );

    expect(painter.rects).toEqual([
      { fill: '#ff0000', x: 0, y: 0, w: 20, h: 6 },
      { fill: '#0000ff', x: 0, y: 6, w: 20, h: 2 },
      { fill: '#00ff00', x: 0, y: 8, w: 20, h: 2 },
    ]);
  });

  it('hachure une colonne sans palette connue, et partage la largeur', () => {
    const painter = new RecordingPainter();

    paintStrip(
      painter,
      [column([]), column([{ hex: '#000000', share: 1, outlier: false }])],
      FRAME,
    );

    const hatched = painter.rects.filter((rect) => rect.x === 0);
    expect(hatched.map((rect) => rect.fill)).toEqual(['#eee', '#ccc', '#eee']);
    expect(painter.rects.at(-1)).toEqual({ fill: '#000000', x: 10, y: 0, w: 10, h: 10 });
  });
});
