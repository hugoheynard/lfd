import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { PreparationBoard, ShelfCard } from '../preparation-shelves';
import { lineBadge, type QualityLookup, type QualityRequest } from '../quality-badges';
import { NO_MATCHES, type SupervisionMatches } from '../supervision-search';
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
        produced: 0,
        remaining: 96,
        surplus: 0,
        batches: [],
        container: null,
      },
    ],
    done: [
      {
        sku: 'cro',
        productName: 'Croissant',
        quantity: 50,
        containerLabel: null,
        done: true,
        initials: 'HH',
        doneAt: null,
        produced: 50,
        remaining: 0,
        surplus: 0,
        batches: [],
        container: null,
      },
    ],
    ...overrides,
  };
}

async function mount(
  board: PreparationBoard,
  showLinks = true,
  matches: SupervisionMatches = NO_MATCHES,
) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(PreparationColumn);
  fixture.componentRef.setInput('board', board);
  fixture.componentRef.setInput('matches', matches);
  fixture.componentRef.setInput('showLinks', showLinks);
  fixture.detectChanges();
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  return element;
}

const BOARD: PreparationBoard = {
  open: [card('Viennoiseries')],
  finished: [card('Pains', { state: 'done', doneCount: 2, pending: [], done: [] })],
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

  /** Hugo, 2026-09-28 : repliés en une ligne de noms, on ne voyait plus ce qui était sorti. */
  it('garde les rayons finis visibles, en bas, sous un séparateur daté', async () => {
    const element = await mount(BOARD);
    const shelves = [...element.querySelectorAll('[data-shelf]')].map((shelf) =>
      shelf.getAttribute('data-shelf'),
    );

    expect(element.querySelector('[data-done-divider]')?.textContent).toContain('à 6 h 10');
    expect(shelves.at(-1)).toBe('Pains');
    expect(element.querySelector('[data-shelf="Pains"]')?.classList).toContain('is-done');
  });

  it('surligne le rayon et le produit d’une commande cherchée', async () => {
    const element = await mount(BOARD, true, { references: new Set(), skus: new Set(['cro']) });
    const shelf = element.querySelector('[data-shelf="Viennoiseries"]');

    expect(shelf?.classList).toContain('is-match');
    expect(shelf?.querySelector('[data-line-done]')?.classList).toContain('is-match');
    expect(element.querySelector('[data-shelf="Pains"]')?.classList).not.toContain('is-match');
  });

  it('déplie un rayon en cours sur ses lignes sorties, avec leurs initiales', async () => {
    const element = await mount(BOARD);
    const done = element.querySelector('[data-detail="Viennoiseries"] [data-line-done]');

    expect(done?.textContent).toContain('Croissant');
    expect(done?.textContent).toContain('HH');
    expect(element.querySelector('[data-detail="Pains"]')).not.toBeNull();
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

  /** `plan-controle-qualite.md`, §5 et D5 : la pastille de chaque ligne, la pire sur le rayon. */
  it('pose la pastille de chaque ligne, la pire sur le rayon, et dit la péremption', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PreparationColumn);
    const lookup: QualityLookup = {
      lines: new Map([
        [
          'pac',
          lineBadge({
            sku: 'pac',
            verdict: 'ok',
            checkedAt: 'x',
            quantitySeen: 80,
            currentQuantity: 96,
            stale: true,
          }),
        ],
        [
          'cro',
          lineBadge({
            sku: 'cro',
            verdict: 'warning',
            checkedAt: 'x',
            quantitySeen: 50,
            currentQuantity: 50,
            stale: false,
          }),
        ],
      ]),
      orders: new Map(),
    };
    fixture.componentRef.setInput('board', BOARD);
    fixture.componentRef.setInput('quality', lookup);
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const shelf = element.querySelector('[data-shelf="Viennoiseries"]');
    const lines = [...(shelf?.querySelectorAll('[data-line-quality]') ?? [])].map((badge) =>
      badge.textContent?.trim(),
    );

    expect(lines).toEqual(['Contrôle · À revoir', 'Contrôle · Réserve']);
    expect(shelf?.querySelector('[data-line-stale]')?.textContent).toContain(
      'Contrôlé sur 80, compte actuel 96 — à revoir',
    );
    expect(shelf?.querySelector('[data-shelf-quality]')?.textContent).toContain('À revoir');
    expect(element.querySelector('[data-shelf="Pains"] [data-shelf-quality]')).toBeNull();
  });

  it('ne propose « Contrôler » qu’à qui peut juger, sur chaque ligne', async () => {
    const reader = await mount(BOARD);
    expect(reader.querySelector('[data-check]')).toBeNull();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PreparationColumn);
    fixture.componentRef.setInput('board', BOARD);
    fixture.componentRef.setInput('canCheck', true);
    fixture.detectChanges();
    await fixture.whenStable();
    const asked: QualityRequest[] = [];
    fixture.componentInstance.check.subscribe((request) => asked.push(request));
    const element: HTMLElement = fixture.nativeElement;

    // À sortir comme sortie : tout le compte du jour se juge.
    expect(element.querySelectorAll('[data-shelf="Viennoiseries"] [data-check]')).toHaveLength(2);
    element.querySelector<HTMLButtonElement>('[data-check="pac"]')?.click();
    expect(asked).toEqual([
      {
        target: { kind: 'line', sku: 'pac' },
        title: 'Pain au chocolat',
        subtitle: '96 pièces au compte',
      },
    ]);
  });

  /** Hugo, 2026-09-28 : une barre par produit, et le surplus en avertissement. */
  it('pose une barre par produit, et le surplus en avertissement', async () => {
    const base = card('Viennoiseries');
    const [pending] = base.pending;
    const [done] = base.done;
    if (pending === undefined || done === undefined) {
      throw new Error('fixture incomplète');
    }
    const element = await mount({
      ...BOARD,
      open: [
        {
          ...base,
          pending: [{ ...pending, produced: 40, remaining: 56 }],
          done: [{ ...done, produced: 54, surplus: 4 }],
        },
      ],
    });

    expect(element.querySelector('[data-line-progress="pac"]')?.textContent).toContain(
      '40 / 96 sorties',
    );
    expect(element.querySelector('[data-line-progress="cro"]')?.classList).toContain('success');
    expect(element.querySelector('[data-line-surplus="cro"]')?.textContent).toContain('+4');
    expect(element.querySelector('[data-line-surplus="pac"]')).toBeNull();
  });
});
