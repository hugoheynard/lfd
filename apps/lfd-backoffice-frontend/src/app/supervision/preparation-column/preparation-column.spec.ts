import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { PreparationBoard, ShelfCard } from '../preparation-shelves';
import { PreparationColumn } from './preparation-column';

function card(key: string, overrides: Partial<ShelfCard> = {}): ShelfCard {
  return {
    key,
    label: key,
    state: 'in_progress',
    doneCount: 1,
    lineCount: 2,
    remainingUnits: 96,
    totalUnits: 146,
    pending: [
      {
        sku: 'pac',
        productName: 'Pain au chocolat',
        quantity: 96,
        containerLabel: null,
        done: false,
        initials: null,
        doneAt: null,
      },
    ],
    ...overrides,
  };
}

async function mount(board: PreparationBoard, showLinks = true) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(PreparationColumn);
  fixture.componentRef.setInput('board', board);
  fixture.componentRef.setInput('showLinks', showLinks);
  fixture.detectChanges();
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  return element;
}

const BOARD: PreparationBoard = {
  open: [card('Viennoiseries')],
  finished: [card('Pains', { state: 'done', doneCount: 2, pending: [] })],
  finishedAt: '6 h 10',
  openLines: 1,
  shelvesKnown: true,
};

describe('PreparationColumn', () => {
  it('liste les lignes à sortir sans case à cocher', async () => {
    const element = await mount(BOARD);

    expect(element.textContent).toContain('1 / 2 lignes');
    expect(element.textContent).toContain('96 pièces restantes');
    expect(element.textContent).toContain('Pain au chocolat');
    expect(element.querySelector('input, fold-checkbox')).toBeNull();
  });

  it('replie les rayons finis dans un encart daté', async () => {
    const element = await mount(BOARD);

    expect(element.querySelector('[data-folded]')?.textContent).toContain('Pains');
    expect(element.querySelector('[data-folded]')?.textContent).toContain('terminés à 6 h 10');
    expect(element.querySelector('[data-shelf="Pains"]')).toBeNull();
  });

  it('renvoie vers la fournée, seulement si on le lui permet', async () => {
    expect((await mount(BOARD)).querySelector('a')?.getAttribute('href')).toBe(
      '/production/journee',
    );
    TestBed.resetTestingModule();
    expect((await mount(BOARD, false)).querySelector('a')).toBeNull();
  });

  it('dit quand les rayons n’ont pas pu être lus', async () => {
    const element = await mount({ ...BOARD, shelvesKnown: false });

    expect(element.querySelector('fold-callout')?.textContent).toContain('Rayon inconnu');
  });
});
