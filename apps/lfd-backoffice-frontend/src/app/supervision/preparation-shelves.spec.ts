import { describe, expect, it } from 'vitest';

import type { ProductionWorksheetView, WorkshopGroup, WorkshopLine } from '@lfd/contracts';

import { lineProgressOf, preparationBoard, shelfStateOf } from './preparation-shelves';

function line(sku: string, done: boolean, doneAt: string | null = null): WorkshopLine {
  return {
    sku,
    productName: sku,
    quantity: 10,
    containerLabel: null,
    done,
    initials: null,
    doneAt,
    produced: done ? 10 : 0,
    remaining: done ? 0 : 10,
    surplus: 0,
    batches: [],
    container: null,
  };
}

function group(key: string, lines: readonly WorkshopLine[]): WorkshopGroup {
  const done = lines.filter((l) => l.done);
  const pending = lines.filter((l) => !l.done);
  return {
    key,
    family: { id: key, name: key, position: 0 },
    category: null,
    label: key,
    lineCount: lines.length,
    doneCount: done.length,
    totalUnits: lines.length * 10,
    remainingUnits: pending.length * 10,
    doneUnits: done.length * 10,
    lines,
    pending,
    done,
  };
}

function view(groups: readonly WorkshopGroup[]): ProductionWorksheetView {
  return {
    date: '2026-09-25',
    generatedAt: null,
    retakenAt: null,
    lines: [],
    drift: null,
    groups,
    shelvesKnown: true,
    relativeDay: 'today',
  };
}

describe('la colonne Préparation', () => {
  it('nomme l’état d’un rayon par ses lignes faites', () => {
    expect(shelfStateOf(group('a', [line('x', true)]))).toBe('done');
    expect(shelfStateOf(group('b', [line('x', true), line('y', false)]))).toBe('in_progress');
    expect(shelfStateOf(group('c', [line('x', false)]))).toBe('not_started');
  });

  it('montre en cours puis pas commencés, et replie les rayons finis', () => {
    const board = preparationBoard(
      view([
        group('pains', [line('p', true, '2026-09-25T04:10:00.000Z')]),
        group('tartes', [line('t', false)]),
        group('viennoiseries', [line('v1', true), line('v2', false)]),
      ]),
    );

    expect(board.open.map((card) => card.key)).toEqual(['viennoiseries', 'tartes']);
    expect(board.finished.map((card) => card.key)).toEqual(['pains']);
    expect(board.finishedAt).toBe('6 h 10');
    expect(board.openLines).toBe(2);
  });

  it('liste les lignes encore à sortir, sans les faites', () => {
    const board = preparationBoard(view([group('v', [line('fait', true), line('reste', false)])]));

    expect(board.open[0]?.pending.map((l) => l.sku)).toEqual(['reste']);
  });

  /** Fournées progressives : 4 sorties sur 10 ne complètent aucune ligne, mais le rayon est entamé. */
  it('dit « en cours » un rayon dont une ligne est entamée sans être complète', () => {
    const partial = { ...line('x', false), produced: 4, remaining: 6 };
    const shelf = { ...group('a', [partial]), doneUnits: 4, remainingUnits: 6 };

    expect(shelfStateOf(shelf)).toBe('in_progress');
  });
});

describe('la barre par produit', () => {
  it('compte ce qui est sorti sur ce qui est au compte, en attente de teinte tant que rien ne sort', () => {
    expect(lineProgressOf(line('x', false))).toEqual({
      value: 0,
      max: 10,
      label: '0 / 10 sorties',
      surplus: null,
      tone: 'accent',
    });
    expect(lineProgressOf({ ...line('x', false), produced: 4, remaining: 6 })).toMatchObject({
      value: 4,
      label: '4 / 10 sorties',
      tone: 'warning',
    });
  });

  it('montre le surplus à côté, sans le laisser remplir la barre', () => {
    const over = { ...line('x', true), produced: 14, surplus: 4 };

    expect(lineProgressOf(over)).toEqual({
      value: 10,
      max: 10,
      label: '14 / 10 sorties',
      surplus: '+4',
      tone: 'success',
    });
  });
});
