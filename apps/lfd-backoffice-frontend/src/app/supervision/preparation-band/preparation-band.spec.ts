import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ALL_SHELVES, type PreparationBoard, type ShelfCard } from '../preparation-shelves';
import { PreparationBand } from './preparation-band';

function card(key: string, lineCount: number): ShelfCard {
  return {
    key,
    label: key,
    state: 'in_progress',
    doneCount: 0,
    lineCount,
    remainingUnits: 0,
    totalUnits: 0,
    pending: [],
    done: [],
  };
}

const BOARD: PreparationBoard = {
  open: [card('Viennoiseries', 3)],
  finished: [card('Pains', 2)],
  finishedAt: null,
  openLines: 3,
  shelvesKnown: true,
};

async function mount() {
  const fixture = TestBed.createComponent(PreparationBand);
  fixture.componentRef.setInput('board', BOARD);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('PreparationBand', () => {
  it('pose le repère et le filtre, sur « Tous les rayons » par défaut', async () => {
    const fixture = await mount();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.textContent).toContain('À sortir d');
    expect(element.textContent).toContain('Tous les rayons');
    expect(fixture.componentInstance.filter()).toBe(ALL_SHELVES);
    expect(element.querySelector('.filter')?.classList).not.toContain('is-active');
  });

  it('teinte le filtre dès qu’un rayon est retenu', async () => {
    const fixture = await mount();
    fixture.componentInstance.filter.set('Pains');
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('.filter')?.classList).toContain('is-active');
    expect(element.textContent).toContain('Pains');
  });
});

/** Hugo, 2026-11-01 : la colonne 1 se lit aussi par tranche. */
describe('PreparationBand — la bascule Par rayon / Par tranche', () => {
  it('s’ouvre par rayon, avec le filtre des rayons', async () => {
    const fixture = await mount();
    const element: HTMLElement = fixture.nativeElement;

    expect(fixture.componentInstance.view()).toBe('shelves');
    expect(element.querySelector('[data-preparation-view]')?.textContent).toContain('Par tranche');
    expect(element.querySelector('fold-listbox')).not.toBeNull();
  });

  it('bascule par tranche au clic, et le filtre des rayons s’efface', async () => {
    const fixture = await mount();
    const element: HTMLElement = fixture.nativeElement;
    const slots = [...element.querySelectorAll<HTMLElement>('[role="radio"]')].find((node) =>
      node.textContent?.includes('Par tranche'),
    );

    slots?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.view()).toBe('slots');
    expect(element.querySelector('fold-listbox')).toBeNull();
  });
});
