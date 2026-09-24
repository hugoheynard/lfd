import { describe, expect, it } from 'vitest';

import { DEFAULT_CAROUSEL } from '@lfd/storefront-layout';

import type { EditorBlock } from '../storefront-block';
import { reshape } from '../storefront-reshape';

/** Six rangées partout — le cas de la plupart des tests. */
const six = (): number => 6;

const tuned: EditorBlock = {
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
    const result = reshape([tuned], six, 't', 'block');
    expect(result.ok && result.blocks).toEqual([{ ...tuned, format: 'block' }]);
  });

  it('un côté que la nouvelle forme ne permet pas repasse à son défaut', () => {
    const result = reshape([tuned], six, 't', 'kakemono');
    expect(result.ok && result.blocks[0]?.mediaSide).toBe('top');
  });

  it('un côté encore permis est gardé ; sans côté réglé, rien n’est inventé', () => {
    const toBand = reshape([tuned], six, 't', 'hero');
    expect(toBand.ok && toBand.blocks[0]?.mediaSide).toBe('right');
    const plain: EditorBlock = { id: 'p', format: 'tile', column: 1, row: 1, shelves: ['all'] };
    const result = reshape([plain], six, 'p', 'card');
    expect(result.ok && result.blocks[0]).not.toHaveProperty('mediaSide');
  });

  it('passer à la Carte garde l’option mobile, sans objet mais intacte', () => {
    const result = reshape([tuned], six, 't', 'card');
    expect(result.ok && result.blocks[0]).toMatchObject({ format: 'card', applyOnMobile: false });
  });

  it('refuse un débordement : tuile en colonne 4 → bande', () => {
    const tile: EditorBlock = { ...tuned, column: 4 };
    expect(reshape([tile], six, 't', 'band')).toEqual({ ok: false, reason: 'columns', on: 'all' });
  });

  it('refuse un débordement en bas', () => {
    const low: EditorBlock = { ...tuned, row: 6 };
    expect(reshape([low], six, 't', 'block')).toEqual({ ok: false, reason: 'rows', on: 'all' });
  });

  it('refuse un chevauchement sur UN SEUL de ses rayons, en le nommant', () => {
    const chocoCard: EditorBlock = {
      id: 'k',
      format: 'card',
      column: 1,
      row: 2,
      shelves: ['chocolate'],
    };
    const allCard: EditorBlock = { id: 'a', format: 'card', column: 5, row: 2, shelves: ['bread'] };
    expect(reshape([tuned, chocoCard, allCard], six, 't', 'block')).toEqual({
      ok: false,
      reason: 'overlap',
      blocker: chocoCard,
      shelf: 'chocolate',
      on: 'chocolate',
    });
  });

  it('juge chaque rayon avec SES rangées : trop court sur un seul, refusé en le nommant', () => {
    const rowsOf = (shelf: string): number => (shelf === 'chocolate' ? 2 : 6);
    expect(reshape([tuned], rowsOf, 't', 'block').ok).toBe(true);
    const low: EditorBlock = { ...tuned, row: 2 };
    expect(reshape([low], rowsOf, 't', 'block')).toEqual({
      ok: false,
      reason: 'rows',
      on: 'chocolate',
    });
  });

  it('succès simple ; même forme ou id inconnu : rien ne change', () => {
    const blocks = [tuned];
    const result = reshape(blocks, six, 't', 'card');
    expect(result.ok && result.blocks[0]?.format).toBe('card');
    expect(reshape(blocks, six, 't', 'tile')).toEqual({ ok: true, blocks });
    expect(reshape(blocks, six, 'nope', 'band')).toEqual({ ok: true, blocks });
  });
});
