import { describe, expect, it } from 'vitest';

import {
  FORMAT_1_1,
  FORMAT_16_9,
  FORMAT_21_9,
  FORMAT_4_3,
  formatGap,
  formatGapSentence,
  MEDIA_ROLE_FORMATS,
  PREVIEW_FRAMES,
  ratioName,
  roleLabel,
} from './media-formats';
import type { FormatGap, MediaFormat, MediaRoleFormat } from './media-formats';

function role(name: string): MediaRoleFormat {
  const entry = MEDIA_ROLE_FORMATS[name];
  if (entry === undefined) {
    throw new Error(`rôle inconnu : ${name}`);
  }
  return entry;
}

function gapOf(width: number, height: number, target: MediaFormat): FormatGap {
  const gap = formatGap(width, height, target);
  if (gap === null) {
    throw new Error('écart attendu');
  }
  return gap;
}

describe('media-formats — la table', () => {
  it("dit l'ouverture en 4/3, comme la boutique la coupe", () => {
    // Régression (2026-10-10) : le libellé annonçait 3/2, la boutique coupait en 4/3.
    expect(role('hero').format).toBe(FORMAT_4_3);
    expect(roleLabel(role('hero'))).toBe('Ouverture (4/3)');
    expect(roleLabel(role('thumbnail'))).toBe('Vignette de rayon (4/3)');
    expect(roleLabel(role('gallery'))).toBe('Galerie');
  });

  it('montre les quatre cadres en aperçu', () => {
    expect(PREVIEW_FRAMES.map((frame) => frame.format.short)).toEqual([
      '4/3',
      '1/1',
      '16/9',
      '21/9',
    ]);
  });
});

describe('ratioName', () => {
  it('nomme les ratios courants, paysage et portrait', () => {
    expect(ratioName(1.5)).toBe('3/2');
    expect(ratioName(4 / 3)).toBe('4/3');
    expect(ratioName(2 / 3)).toBe('2/3');
    expect(ratioName(3 / 4)).toBe('3/4');
    expect(ratioName(1)).toBe('1/1');
    expect(ratioName(16 / 9)).toBe('16/9');
    expect(ratioName(21 / 9)).toBe('21/9');
  });

  it('retombe sur une décimale à la française', () => {
    expect(ratioName(1.62)).toBe('1,62');
  });
});

describe('formatGap', () => {
  it('signale un 3/2 posé en 4/3', () => {
    expect(formatGap(3000, 2000, FORMAT_4_3)).toEqual({
      actual: '3/2',
      actualRatio: 1.5,
      large: false,
    });
  });

  it('tait un écart sous la tolérance de 8 %', () => {
    expect(formatGap(1300, 1000, FORMAT_4_3)).toBeNull();
    expect(formatGap(1430, 1000, FORMAT_4_3)).toBeNull();
    expect(formatGap(1450, 1000, FORMAT_4_3)).not.toBeNull();
  });

  it('dit une grande coupe quand un portrait va en paysage', () => {
    expect(formatGap(2000, 3000, FORMAT_4_3)).toMatchObject({ actual: '2/3', large: true });
    expect(formatGap(1600, 1200, FORMAT_21_9)).toMatchObject({ actual: '4/3', large: true });
  });

  it("ne dit rien d'une image non mesurée ni d'un usage sans format", () => {
    expect(formatGap(null, 1000, FORMAT_1_1)).toBeNull();
    expect(formatGap(undefined, undefined, FORMAT_1_1)).toBeNull();
    expect(formatGap(0, 0, FORMAT_1_1)).toBeNull();
    expect(formatGap(3000, 1000, null)).toBeNull();
  });

  it('accepte une image juste au format', () => {
    expect(formatGap(1920, 1080, FORMAT_16_9)).toBeNull();
  });
});

describe('formatGapSentence', () => {
  it("rédige la phrase de l'ouverture", () => {
    const gap = gapOf(3000, 2000, FORMAT_4_3);
    expect(formatGapSentence(gap, role('hero'))).toBe(
      "Cette image est en 3/2 (≈ 1,50), l'ouverture attend du 4/3 (1,33) : un bord sera coupé. Vérifiez son point focal dans la médiathèque.",
    );
  });

  it('dit un ratio sans nom par sa décimale', () => {
    const gap = gapOf(1620, 1000, FORMAT_1_1);
    expect(formatGapSentence(gap, role('print'))).toContain(
      'Cette image est en ≈ 1,62, le tirage papier attend du 1/1 (1,00) : une grande partie sera coupée.',
    );
  });
});
