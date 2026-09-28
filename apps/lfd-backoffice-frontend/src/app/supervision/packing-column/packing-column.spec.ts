import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { PackingBoard, PackingCard } from '../packing-cards';
import { NO_QUALITY, orderBadge, type QualityLookup, type QualityRequest } from '../quality-badges';
import { NO_MATCHES, type SupervisionMatches } from '../supervision-search';
import { PackingColumn } from './packing-column';

function card(reference: string, overrides: Partial<PackingCard> = {}): PackingCard {
  return {
    reference,
    orderId: `o-${reference}`,
    customerLabel: `Client ${reference}`,
    method: 'pickup',
    destination: 'Boutique',
    state: 'in_progress',
    lineCount: 9,
    packedLines: 6,
    containers: 1,
    awaited: [],
    initials: ['LT'],
    slotMinutes: 420,
    packedAt: null,
    ...overrides,
  };
}

const BOARD: PackingBoard = {
  notClosed: false,
  upcoming: [],
  visible: [
    card('CMD-1'),
    card('CMD-2', { state: 'awaiting_oven', awaited: ['Éclair pistache'], packedLines: 0 }),
  ],
  overflow: 13,
  packed: [card('CMD-3', { state: 'packed', packedAt: '5 h 12' })],
  toPack: 15,
  awaitingOven: 1,
};

async function mountFixture(
  board: PackingBoard,
  matches: SupervisionMatches = NO_MATCHES,
  quality: {
    lookup?: QualityLookup;
    canCheck?: boolean;
    awaitedOpen?: string;
    narrow?: boolean;
  } = {},
) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(PackingColumn);
  fixture.componentRef.setInput('board', board);
  fixture.componentRef.setInput('matches', matches);
  fixture.componentRef.setInput('showLinks', true);
  fixture.componentRef.setInput('quality', quality.lookup ?? NO_QUALITY);
  fixture.componentRef.setInput('canCheck', quality.canCheck ?? false);
  fixture.componentRef.setInput('awaitedOpen', quality.awaitedOpen ?? null);
  fixture.componentRef.setInput('narrow', quality.narrow ?? false);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

async function mount(board: PackingBoard, matches: SupervisionMatches = NO_MATCHES) {
  const element: HTMLElement = (await mountFixture(board, matches)).nativeElement;
  return element;
}

describe('PackingColumn', () => {
  /** Hugo, 2026-09-28 : l'heure où la commande a été déclarée prête manquait. */
  it('donne l’heure de déclaration aux commandes colisées', async () => {
    const element = await mount(BOARD);

    expect(
      element.querySelector('[data-reference="CMD-3"] [data-packed-at]')?.textContent,
    ).toContain('Prête à 5 h 12');
  });

  it('surligne les commandes que la recherche désigne', async () => {
    const element = await mount(BOARD, {
      ...NO_MATCHES,
      mode: 'search',
      references: new Set(['CMD-3', 'CMD-1']),
      current: 'CMD-3',
    });
    const packed = element.querySelector('[data-hit-key="CMD-3"]');

    expect(packed?.classList).toContain('is-match');
    expect(packed?.classList).toContain('is-current');
    expect(element.querySelector('[data-reference="CMD-1"]')?.classList).not.toContain(
      'is-current',
    );
    expect(element.querySelector('[data-reference="CMD-2"]')?.classList).not.toContain('is-match');
  });

  it('écrit l’avancement d’un bac en cours, et qui y pose', async () => {
    const element = await mount(BOARD);
    const inProgress = element.querySelector('[data-reference="CMD-1"]');

    expect(inProgress?.textContent).toContain('6 références sur 9 posées');
    expect(inProgress?.querySelector('.pastille')?.textContent).toContain('En cours');
    expect(inProgress?.textContent).toContain('CMD-1 · retrait 7\u00a0h');
  });

  it('replié, compte ce qui attend le four, sans renvoi — rien à y faire', async () => {
    const element = await mount(BOARD);
    const waiting = element.querySelector('[data-reference="CMD-2"]');

    expect(waiting?.querySelector('[data-blocked]')?.textContent).toContain(
      '1 produit attendu du four',
    );
    expect(waiting?.textContent).not.toContain('Éclair pistache');
    expect(waiting?.querySelector('a')).toBeNull();
  });

  /** Supervision v2, A5 : déplier demande la mise en avant, la page la pose. */
  it('le bouton et le double-clic demandent le dépliage de la commande', async () => {
    const fixture = await mountFixture(BOARD);
    const element: HTMLElement = fixture.nativeElement;
    const asked: string[] = [];
    fixture.componentInstance.awaitedToggle.subscribe((reference) => asked.push(reference));

    element.querySelector<HTMLButtonElement>('[data-blocked]')?.click();
    element.querySelector('[data-reference="CMD-2"]')?.dispatchEvent(new MouseEvent('dblclick'));
    element.querySelector('[data-reference="CMD-1"]')?.dispatchEvent(new MouseEvent('dblclick'));

    expect(asked).toEqual(['CMD-2', 'CMD-2']);
  });

  it('dépliée, la carte source liste les produits et recule les autres', async () => {
    const products: SupervisionMatches = {
      ...NO_MATCHES,
      mode: 'products',
      references: new Set(['CMD-2']),
    };
    const element: HTMLElement = (await mountFixture(BOARD, products, { awaitedOpen: 'CMD-2' }))
      .nativeElement;
    const source = element.querySelector('[data-reference="CMD-2"]');

    expect(source?.classList).toContain('is-source');
    expect(source?.classList).not.toContain('is-match');
    expect(source?.textContent).toContain('Éclair pistache');
    expect(source?.textContent).toContain('← en colonne 1');
    expect(source?.querySelector('[data-blocked]')?.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('[data-reference="CMD-1"]')?.classList).toContain('is-receded');
    expect(element.querySelector('[data-reference="CMD-3"]')?.classList).toContain('is-receded');
  });

  /** B7 : au téléphone, la commande dépliée renvoie vers l'onglet Préparation. */
  it('au téléphone, « Voir en Préparation » remplace l’indice de colonne', async () => {
    const products: SupervisionMatches = {
      ...NO_MATCHES,
      mode: 'products',
      references: new Set(['CMD-2']),
    };
    const fixture = await mountFixture(BOARD, products, { awaitedOpen: 'CMD-2', narrow: true });
    const element: HTMLElement = fixture.nativeElement;
    let shown = 0;
    fixture.componentInstance.showPreparation.subscribe(() => (shown += 1));

    expect(element.textContent).not.toContain('← en colonne 1');
    element.querySelector<HTMLButtonElement>('[data-show-preparation]')?.click();
    expect(shown).toBe(1);
  });

  it('filtre par point de destination, colisées comprises', async () => {
    const board: PackingBoard = {
      ...BOARD,
      visible: [...BOARD.visible, card('CMD-4', { destination: 'Mairie' })],
    };
    const fixture = await mountFixture(board);
    const element: HTMLElement = fixture.nativeElement;

    fixture.componentInstance.point.set('Mairie');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      [...element.querySelectorAll('[data-hit-key]')].map((node) =>
        node.getAttribute('data-hit-key'),
      ),
    ).toEqual(['CMD-4']);
    expect(element.querySelector('[data-done-divider]')).toBeNull();
  });

  /** Hugo, 2026-09-28 : les colisées restent visibles, en bas et en vert. */
  it('compte au-delà de dix et garde les colisées en cartes, en bas', async () => {
    const open = Array.from({ length: 23 }, (_, i) => card(`R${String(i)}`));
    const element = await mount({ ...BOARD, visible: open });
    const packed = element.querySelector('[data-packing="packed"]');

    expect(element.textContent).toContain('+ 13 commandes · triées par heure de retrait');
    expect(element.querySelector('[data-done-divider]')).not.toBeNull();
    expect(packed?.textContent).toContain('Client CMD-3');
    expect(packed?.classList).toContain('is-done');
  });

  it('dit que la journée n’est pas arrêtée', async () => {
    const element = await mount({ ...BOARD, notClosed: true });

    expect(element.querySelector('[data-not-closed]')).not.toBeNull();
    expect(element.querySelector('fold-card')).toBeNull();
  });

  /** Hugo, 2026-09-28 : la colonne se taisait sur des commandes que Retrait montrait. */
  it('avant l’arrêt, montre les commandes attendues en lecture seule', async () => {
    const element = await mount({
      ...BOARD,
      notClosed: true,
      upcoming: [
        {
          reference: 'CMD-9',
          customerLabel: 'Le Petit Chaudron',
          totalUnits: 36,
          slotMinutes: 540,
        },
      ],
    });
    const upcoming = element.querySelector('[data-reference="CMD-9"]');

    expect(element.querySelector('[data-upcoming]')?.textContent).toContain(
      'Commandes attendues · 1',
    );
    expect(upcoming?.textContent).toContain('Le Petit Chaudron');
    expect(upcoming?.querySelector('a, button')).toBeNull();
  });

  /** `plan-controle-qualite.md`, §5 : seule une commande colisée se juge. */
  it('ne propose « Contrôler » que sur une colisée, et seulement à qui peut juger', async () => {
    const fixture = await mountFixture(BOARD, NO_MATCHES, { canCheck: true });
    const element: HTMLElement = fixture.nativeElement;
    const asked: QualityRequest[] = [];
    fixture.componentInstance.check.subscribe((request) => asked.push(request));

    expect(element.querySelector('[data-reference="CMD-1"] [data-check]')).toBeNull();
    element.querySelector<HTMLButtonElement>('[data-reference="CMD-3"] [data-check]')?.click();
    expect(asked).toEqual([
      {
        target: { kind: 'order', orderId: 'o-CMD-3' },
        title: 'Client CMD-3',
        subtitle: 'Commande CMD-3',
      },
    ]);

    TestBed.resetTestingModule();
    const reader: HTMLElement = (await mountFixture(BOARD)).nativeElement;
    expect(reader.querySelector('[data-check]')).toBeNull();
  });

  it('sans id de commande (file illisible), la colisée ne se vise pas', async () => {
    const board = { ...BOARD, packed: [card('CMD-3', { state: 'packed', orderId: null })] };
    const element: HTMLElement = (await mountFixture(board, NO_MATCHES, { canCheck: true }))
      .nativeElement;

    expect(element.querySelector('[data-check]')).toBeNull();
  });

  it('pose la pastille du contrôle sur la colisée, en toutes lettres', async () => {
    const lookup: QualityLookup = {
      lines: new Map(),
      orders: new Map([
        [
          'CMD-3',
          orderBadge({
            orderId: 'o-CMD-3',
            reference: 'CMD-3',
            verdict: 'blocking',
            checkedAt: 'x',
          }),
        ],
      ]),
    };
    const element: HTMLElement = (await mountFixture(BOARD, NO_MATCHES, { lookup })).nativeElement;
    const badge = element.querySelector('[data-reference="CMD-3"] [data-order-quality]');

    expect(badge?.textContent).toContain('Contrôle · Bloquant');
    expect(badge?.classList).toContain('alert');
  });
});
