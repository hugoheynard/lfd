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

  /** Supervision v2, A6 : un fond par état — la v1 passait tout ce qui n'était pas fini en ambre. */
  it('donne un fond à chaque état : pas commencé, en cours, fini', async () => {
    const element = await mount({
      ...BOARD,
      open: [card('Viennoiseries'), card('Tartes', { state: 'not_started' })],
    });

    expect(element.querySelector('[data-shelf="Viennoiseries"]')?.classList).toContain(
      'is-progress',
    );
    expect(element.querySelector('[data-shelf="Tartes"]')?.classList).toContain('is-idle');
    expect(element.querySelector('[data-shelf="Tartes"]')?.textContent).toContain('pas commencé');
    expect(element.querySelector('[data-shelf="Pains"]')?.classList).toContain('is-done');
  });

  /** Hugo, 2026-09-28 (Supervision v2) : les rayons finis se replient sous « Terminés ». */
  it('replie les rayons finis sous un séparateur daté, l’en-tête disant son contrôle', async () => {
    const element = await mount({ ...BOARD, finished: [card('Pains', { state: 'done' })] });
    const shelves = [...element.querySelectorAll('[data-shelf]')].map((shelf) =>
      shelf.getAttribute('data-shelf'),
    );
    const pains = element.querySelector('[data-shelf="Pains"]');

    expect(element.querySelector('[data-done-divider]')?.textContent).toContain(
      'Terminés · 1 · à 6 h 10',
    );
    expect(shelves.at(-1)).toBe('Pains');
    expect(pains?.querySelector('[data-hit-key]')).toBeNull();
    expect(pains?.querySelector('[data-shelf-quality]')?.textContent).toContain('Contrôle 0/2');
  });

  it('surligne le produit d’une commande cherchée, et le halo sur l’occurrence courante', async () => {
    const element = await mount(BOARD, true, {
      ...NO_MATCHES,
      mode: 'search',
      skus: new Set(['cro']),
      current: 'cro',
    });
    const hit = element.querySelector('[data-hit-key="cro"]');

    expect(hit?.classList).toContain('is-match');
    expect(hit?.classList).toContain('is-current');
    expect(element.querySelector('[data-hit-key="pac"]')?.classList).not.toContain('is-match');
    expect(element.querySelector('.is-receded')).toBeNull();
  });

  it('ouvre un rayon fini replié qui porte une occurrence', async () => {
    const element = await mount({ ...BOARD, finished: [card('Pains', { state: 'done' })] }, true, {
      ...NO_MATCHES,
      mode: 'search',
      skus: new Set(['pac']),
    });

    expect(element.querySelector('[data-shelf="Pains"] [data-hit-key="pac"]')).not.toBeNull();
    expect(element.querySelector('[data-shelf="Pains"] [data-shelf-quality]')).toBeNull();
  });

  /** A5 : on suit des produits attendus du four — ils ressortent, le reste recule. */
  it('en mode produits, étiquette les lignes attendues et fait reculer le reste', async () => {
    const element = await mount(
      { ...BOARD, open: [card('Viennoiseries'), card('Tartes', { pending: [], done: [] })] },
      true,
      {
        ...NO_MATCHES,
        mode: 'products',
        skus: new Set(['pac']),
        awaitedBy: new Map([['pac', ['Chalet Marmotte', 'Traiteur Vermeil']]]),
      },
    );
    const awaited = element.querySelector('[data-hit-key="pac"]');

    expect(awaited?.classList).toContain('is-awaited');
    expect(awaited?.classList).not.toContain('is-match');
    expect(element.querySelector('[data-line-awaited="pac"]')?.textContent).toContain(
      'Attendu · Chalet Marmotte, Traiteur Vermeil',
    );
    expect(element.querySelector('[data-hit-key="cro"]')?.classList).toContain('is-receded');
    expect(element.querySelector('[data-shelf="Tartes"]')?.classList).toContain('is-receded');
    expect(element.querySelector('[data-shelf="Viennoiseries"]')?.classList).not.toContain(
      'is-receded',
    );
  });

  it('ne montre que le rayon retenu par le filtre de la bande', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PreparationColumn);
    fixture.componentRef.setInput('board', BOARD);
    fixture.componentRef.setInput('shelfFilter', 'Pains');
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;

    expect(
      [...element.querySelectorAll('[data-shelf]')].map((s) => s.getAttribute('data-shelf')),
    ).toEqual(['Pains']);
  });

  it('liste les lignes d’un rayon en cours, sorties comprises, sans initiales', async () => {
    const element = await mount(BOARD);
    const done = element.querySelector('[data-shelf="Viennoiseries"] [data-line-done]');

    expect(done?.textContent).toContain('Croissant');
    // Le surveillant n'a pas l'usage des initiales du préparateur (Hugo, 2026-09-28).
    expect(done?.textContent).not.toContain('HH');
  });

  it('renvoie vers la fournée, seulement si on le lui permet', async () => {
    expect((await mount(BOARD)).querySelector('a')?.getAttribute('href')).toBe('/fournil');
    TestBed.resetTestingModule();
    expect((await mount(BOARD, false)).querySelector('a')).toBeNull();
  });

  it('dit quand les rayons n’ont pas pu être lus', async () => {
    const element = await mount({ ...BOARD, shelvesKnown: false });

    expect(element.querySelector('fold-callout')?.textContent).toContain('Rayon inconnu');
  });

  /** `plan-controle-qualite.md`, §5 et D5 ; v2 A6 : le résumé n/m sur le rayon fini replié. */
  it('pose la pastille de chaque ligne, dit la péremption, et résume le rayon replié', async () => {
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
    fixture.componentRef.setInput('board', {
      ...BOARD,
      finished: [card('Pains', { state: 'done' })],
    });
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
    expect(shelf?.querySelector('[data-shelf-quality]')).toBeNull();
    expect(
      element.querySelector('[data-shelf="Pains"] [data-shelf-quality]')?.textContent,
    ).toContain('Contrôle 2/2 · À revoir');
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

    // Le nom porte la barre ; le chiffre ne se dit qu'une fois, à côté, et se
    // lit en entier à la voix.
    const figure = element.querySelector('[data-line-figure="pac"]');
    expect(figure?.textContent).toMatch(/40\s*\/\s*96/);
    expect(figure?.getAttribute('aria-label')).toContain('40 / 96 sorties');
    expect(element.querySelector('[data-line-progress="cro"]')?.classList).toContain('success');
    expect(element.querySelector('[data-line-surplus="cro"]')?.textContent).toContain('+4');
    expect(element.querySelector('[data-line-surplus="pac"]')).toBeNull();
  });
});
