import { describe, expect, it } from 'vitest';

import type { ProductionWorksheetView, WorkshopGroup, WorkshopLine } from '@lfd/contracts';

import { preparationBoard, shelfStateOf } from './preparation-shelves';

function line(sku: string, done: boolean, doneAt: string | null = null): WorkshopLine {
  return {
    sku,
    productName: sku,
    quantity: 10,
    containerLabel: null,
    done,
    initials: null,
    doneAt,
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
});
