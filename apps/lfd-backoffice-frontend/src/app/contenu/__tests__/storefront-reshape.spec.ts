import { describe, expect, it } from 'vitest';

import { DEFAULT_CAROUSEL } from '../storefront-carousel';
import type { PlacedBlock } from '../storefront-grid';
import { reshape } from '../storefront-reshape';

const tuned: PlacedBlock = {
  id: 't',
  format: 'tile',
  column: 1,
  row: 1,
  shelves: ['all', 'chocolate'],
  tone: 'dark',
  mediaFit: 'contain',
  mediaSide: 'right',
  applyOnMobile: false,
  contents: 'multiple',
  carousel: { ...DEFAULT_CAROUSEL, autoplay: true, sampleCount: 5 },
};

describe('reshape', () => {
  it('garde le coin et tous les réglages compatibles', () => {
    const result = reshape([tuned], 6, 't', 'block');
    expect(result.ok && result.blocks).toEqual([{ ...tuned, format: 'block' }]);
  });

  it('un côté que la nouvelle forme ne permet pas repasse à son défaut', () => {
    const result = reshape([tuned], 6, 't', 'kakemono');
    expect(result.ok && result.blocks[0]?.mediaSide).toBe('top');
  });

  it('un côté encore permis est gardé ; sans côté réglé, rien n’est inventé', () => {
    const toBand = reshape([tuned], 6, 't', 'hero');
    expect(toBand.ok && toBand.blocks[0]?.mediaSide).toBe('right');
    const plain: PlacedBlock = { id: 'p', format: 'tile', column: 1, row: 1, shelves: ['all'] };
    const result = reshape([plain], 6, 'p', 'card');
    expect(result.ok && result.blocks[0]).not.toHaveProperty('mediaSide');
  });

  it('passer à la Carte garde l’option mobile, sans objet mais intacte', () => {
    const result = reshape([tuned], 6, 't', 'card');
    expect(result.ok && result.blocks[0]).toMatchObject({ format: 'card', applyOnMobile: false });
  });

  it('refuse un débordement : tuile en colonne 4 → bande', () => {
    const tile: PlacedBlock = { ...tuned, column: 4 };
    expect(reshape([tile], 6, 't', 'band')).toEqual({ ok: false, reason: 'columns' });
  });

  it('refuse un débordement en bas', () => {
    const low: PlacedBlock = { ...tuned, row: 6 };
    expect(reshape([low], 6, 't', 'block')).toEqual({ ok: false, reason: 'rows' });
  });

  it('refuse un chevauchement sur UN SEUL de ses rayons, en le nommant', () => {
    const chocoCard: PlacedBlock = {
      id: 'k',
      format: 'card',
      column: 1,
      row: 2,
      shelves: ['chocolate'],
    };
    const allCard: PlacedBlock = { id: 'a', format: 'card', column: 5, row: 2, shelves: ['bread'] };
    expect(reshape([tuned, chocoCard, allCard], 6, 't', 'block')).toEqual({
      ok: false,
      reason: 'overlap',
      blocker: chocoCard,
      shelf: 'chocolate',
    });
  });

  it('succès simple ; même forme ou id inconnu : rien ne change', () => {
    const blocks = [tuned];
    const result = reshape(blocks, 6, 't', 'card');
    expect(result.ok && result.blocks[0]?.format).toBe('card');
    expect(reshape(blocks, 6, 't', 'tile')).toEqual({ ok: true, blocks });
    expect(reshape(blocks, 6, 'nope', 'band')).toEqual({ ok: true, blocks });
  });
});
