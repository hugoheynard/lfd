import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  ShortfallAwaitingDecision,
  StaffPermission,
  WithdrawnPackingSheet,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import type { PackingBoard, PackingCard } from '../packing-cards';
import { NO_QUALITY, orderBadge, type QualityLookup, type QualityRequest } from '../quality-badges';
import { NO_MATCHES, type SupervisionMatches } from '../supervision-search';
import { PackingColumn } from './packing-column';

function card(reference: string, overrides: Partial<PackingCard> = {}): PackingCard {
  return {
    reference,
    orderId: `o-${reference}`,
    customerLabel: `Client ${reference}`,
    clientele: null,
    siteId: null,
    pickupLabel: 'Boutique',
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
    sheetOrderId: `o-${reference}`,
    deliveryNotePrint: null,
    abandoned: [],
    shelf: false,
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
  withdrawn: [],
};

async function mountFixture(
  board: PackingBoard,
  matches: SupervisionMatches = NO_MATCHES,
  quality: {
    lookup?: QualityLookup;
    canCheck?: boolean;
    awaitedOpen?: string;
    narrow?: boolean;
    canSendToShop?: boolean;
    shortfalls?: ReadonlyMap<string, ShortfallAwaitingDecision>;
    permissions?: readonly StaffPermission[];
  } = {},
) {
  const permissions = quality.permissions ?? [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PackingColumn);
  fixture.componentRef.setInput('board', board);
  fixture.componentRef.setInput('matches', matches);
  fixture.componentRef.setInput('showLinks', true);
  fixture.componentRef.setInput('quality', quality.lookup ?? NO_QUALITY);
  fixture.componentRef.setInput('canCheck', quality.canCheck ?? false);
  fixture.componentRef.setInput('awaitedOpen', quality.awaitedOpen ?? null);
  fixture.componentRef.setInput('narrow', quality.narrow ?? false);
  fixture.componentRef.setInput('canSendToShop', quality.canSendToShop ?? false);
  fixture.componentRef.setInput('shortfalls', quality.shortfalls ?? new Map());
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

async function mount(board: PackingBoard, matches: SupervisionMatches = NO_MATCHES) {
  const element: HTMLElement = (await mountFixture(board, matches)).nativeElement;
  return element;
}

describe('PackingColumn', () => {
  /** Plan A1, lot A1.3 : une commande annulée après l'arrêt n'est plus une carte à coliser. */
  it('montre à part les feuilles retirées, sous le badge « annulée après l’arrêt »', async () => {
    const element = await mount({
      ...BOARD,
      withdrawn: [
        {
          orderId: 'o-CMD-9',
          reference: 'CMD-9',
          customerLabel: 'Camille',
          withdrawnAt: '2030-03-12T07:00:00.000Z',
          released: [],
        },
      ],
    });

    expect(element.querySelector('[data-withdrawn-divider]')?.textContent).toContain(
      "Annulées après l'arrêt · 1",
    );
    const card = element.querySelector('[data-packing="withdrawn"][data-reference="CMD-9"]');
    expect(card?.querySelector('[data-withdrawn]')?.textContent).toContain("Annulée après l'arrêt");
  });

  /** Plan A1, lot A1.4 : le pain rendu à la réserve peut partir en boutique. */
  describe('« Envoyer en boutique »', () => {
    const withdrawnWith = (released: WithdrawnPackingSheet['released']): PackingBoard => ({
      ...BOARD,
      withdrawn: [
        {
          orderId: 'o-CMD-9',
          reference: 'CMD-9',
          customerLabel: 'Camille',
          withdrawnAt: '2030-03-12T07:00:00.000Z',
          released,
        },
      ],
    });
    const RELEASED = [{ sku: 'CRO', productName: 'Croissant', quantity: 3, free: 5 }];

    it('s’offre à qui a le droit, sur une feuille qui a rendu, et émet la feuille', async () => {
      const fixture = await mountFixture(withdrawnWith(RELEASED), NO_MATCHES, {
        canSendToShop: true,
      });
      const emitted: WithdrawnPackingSheet[] = [];
      fixture.componentInstance.sendToShop.subscribe((sheet) => emitted.push(sheet));

      fixture.nativeElement.querySelector('[data-send-to-shop]')?.click();

      expect(emitted.map((sheet) => sheet.reference)).toEqual(['CMD-9']);
    });

    it('ne s’offre pas sans le droit', async () => {
      const fixture = await mountFixture(withdrawnWith(RELEASED));

      expect(fixture.nativeElement.querySelector('[data-send-to-shop]')).toBeNull();
    });

    it('ne s’offre pas quand rien n’a été rendu à la réserve', async () => {
      const fixture = await mountFixture(withdrawnWith([]), NO_MATCHES, { canSendToShop: true });

      expect(fixture.nativeElement.querySelector('[data-send-to-shop]')).toBeNull();
    });
  });

  it('sans feuille retirée, rien de plus', async () => {
    const element = await mount(BOARD);

    expect(element.querySelector('[data-withdrawn-divider]')).toBeNull();
  });

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

  it('dit « Att. prod x/n » : lignes encore au four sur lignes de la commande (2026-10-25)', async () => {
    const element = await mount(BOARD);
    const badge = element.querySelector('[data-reference="CMD-2"] app-awaiting-badge');

    expect(badge?.textContent?.trim()).toBe('Att. prod 1/9');
  });

  it('une commande en décision attendue passe en tête, au fond d’alerte, et dit son manque', async () => {
    const shortfall: ShortfallAwaitingDecision = {
      orderId: 'o-CMD-2',
      reference: 'CMD-2',
      customerName: null,
      fulfillmentMethod: 'pickup',
      supply: 'planned',
      reportedAt: '2030-01-10T05:30:00.000Z',
      lines: [{ sku: 'ECL', productName: 'Éclair pistache', due: 4, packed: 1, saleUnit: 'piece' }],
    };
    const fixture = await mountFixture(BOARD, NO_MATCHES, {
      shortfalls: new Map([['CMD-2', shortfall]]),
    });
    const element: HTMLElement = fixture.nativeElement;
    const cards = [...element.querySelectorAll('fold-card[data-reference]')];
    const target = element.querySelector('[data-reference="CMD-2"]');

    expect(cards[0]?.getAttribute('data-reference')).toBe('CMD-2');
    expect(target?.classList).toContain('is-shortfall');
    expect(target?.classList).not.toContain('edge-warning');
    expect(target?.textContent).toContain('Manque : Éclair pistache — 1 sur 4 au bac');
    expect(element.querySelector('[data-reference="CMD-1"]')?.classList).not.toContain(
      'is-shortfall',
    );
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

  it('filtre par acheminement coché, colisées comprises', async () => {
    const board: PackingBoard = {
      ...BOARD,
      visible: [...BOARD.visible, card('CMD-4', { pickupLabel: 'Mairie' })],
    };
    const fixture = await mountFixture(board);
    const element: HTMLElement = fixture.nativeElement;

    fixture.componentInstance.routes.set(['Retrait Mairie']);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      [...element.querySelectorAll('[data-hit-key]')].map((node) =>
        node.getAttribute('data-hit-key'),
      ),
    ).toEqual(['CMD-4']);
    expect(element.querySelector('[data-done-divider]')).toBeNull();
  });

  it('filtre par la livraison seule, puis par deux acheminements', async () => {
    const board: PackingBoard = {
      ...BOARD,
      visible: [
        card('CMD-1'),
        card('LIV', { method: 'delivery', pickupLabel: null }),
        card('CMD-4', { pickupLabel: 'Mairie' }),
      ],
      packed: [],
    };
    const fixture = await mountFixture(board);
    const element: HTMLElement = fixture.nativeElement;
    const keys = () =>
      [...element.querySelectorAll('[data-hit-key]')].map((n) => n.getAttribute('data-hit-key'));

    fixture.componentInstance.routes.set(['Livraison']);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(keys()).toEqual(['LIV']);

    fixture.componentInstance.routes.set(['Livraison', 'Retrait Mairie']);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(keys()).toEqual(['LIV', 'CMD-4']);

    fixture.componentInstance.routes.set([]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(keys()).toEqual(['CMD-1', 'LIV', 'CMD-4']);
  });

  /** Hugo, 2026-09-28 : les colisées restent visibles, en bas et en vert. */
  it('compte au-delà de dix et garde les colisées en cartes, en bas', async () => {
    const open = Array.from({ length: 23 }, (_, i) => card(`R${String(i)}`));
    const element = await mount({ ...BOARD, visible: open });
    const packed = element.querySelector('[data-packing="packed"]');

    expect(element.textContent).toContain('Voir 13 commandes de plus · triées par heure');
    expect(element.querySelector('[data-done-divider]')).not.toBeNull();
    expect(packed?.textContent).toContain('Client CMD-3');
    expect(packed?.classList).toContain('is-done');
  });

  /**
   * Régression du 2026-11-01 : « + N commandes » n'était qu'un texte, et les
   * retraits du Village de 9 h, rangés après la dixième, n'apparaissaient pas
   * au colisage.
   */
  it('montre les commandes au-delà de dix quand on déplie, puis replie', async () => {
    const open = Array.from({ length: 12 }, (_, i) => card(`R${String(i)}`));
    const fixture = await mountFixture({ ...BOARD, visible: [...open, card('VILLAGE-9H')] });
    const element: HTMLElement = fixture.nativeElement;
    const button = () => element.querySelector<HTMLButtonElement>('[data-overflow]');
    expect(element.querySelector('[data-hit-key="VILLAGE-9H"]')).toBeNull();

    button()?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelector('[data-hit-key="VILLAGE-9H"]')).not.toBeNull();
    expect(button()?.getAttribute('aria-expanded')).toBe('true');

    button()?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelector('[data-hit-key="VILLAGE-9H"]')).toBeNull();
  });

  /**
   * Régression (2026-11-01) : une commande trouvée par la recherche au-delà
   * de la dixième restait repliée, invisible tant qu'on ne dépliait pas.
   */
  it('déplie d’elle-même quand la recherche trouve une commande au-delà de dix', async () => {
    const open = Array.from({ length: 12 }, (_, i) => card(`R${String(i)}`));
    const element = await mount(
      { ...BOARD, visible: [...open, card('VILLAGE-9H')] },
      { ...NO_MATCHES, references: new Set(['VILLAGE-9H']), mode: 'search', current: 'VILLAGE-9H' },
    );

    expect(element.querySelector('[data-hit-key="VILLAGE-9H"]')).not.toBeNull();
    expect(element.querySelector('[data-overflow]')?.getAttribute('aria-expanded')).toBe('true');
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
          clientele: 'pro',
          method: 'pickup',
          siteId: null,
          pickupLabel: 'Boutique',
          totalUnits: 36,
          slotMinutes: 540,
          shelf: false,
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

  /** Régression (Hugo, 2026-11-02) : « Sur stock » manquait au colisage. */
  it('montre « Sur stock » sur une carte et une attendue prises en vitrine (L6)', async () => {
    const closed = await mount({
      ...BOARD,
      visible: [card('CMD-S', { shelf: true }), card('CMD-P')],
    });
    expect(closed.querySelector('[data-reference="CMD-S"] [data-packing-shelf]')).not.toBeNull();
    expect(closed.querySelector('[data-reference="CMD-P"] [data-packing-shelf]')).toBeNull();

    TestBed.resetTestingModule();
    const upcoming = await mount({
      ...BOARD,
      notClosed: true,
      upcoming: [
        {
          reference: 'CMD-9',
          customerLabel: 'Le Petit Chaudron',
          clientele: 'pro',
          method: 'pickup',
          siteId: null,
          pickupLabel: 'Boutique',
          totalUnits: 36,
          slotMinutes: 540,
          shelf: true,
        },
      ],
    });
    expect(upcoming.querySelector('[data-reference="CMD-9"] [data-packing-shelf]')).not.toBeNull();
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

/** Hugo, 2026-11-01 : « les badges Particulier / Pro et les couleurs Livraison / Retrait <site> ». */
describe('PackingColumn — clientèle et acheminement, comme la page Commandes', () => {
  const PALETTE = [
    {
      id: 'adroit',
      label: 'Adroit',
      supply: 'on_site',
      isDeparture: true,
      pickupColorB2b: null,
      pickupColorB2c: '#fdd835',
      deliveryColorB2b: '#000080',
      deliveryColorB2c: null,
      resupplyColor: null,
      transferColor: null,
    },
  ] as const;

  async function mountTagged(board: PackingBoard): Promise<HTMLElement> {
    const fixture = await mountFixture(board);
    fixture.componentRef.setInput('palette', PALETTE);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('« Particulier » et « Retrait Adroit » à la couleur du site, sans perdre la recherche', async () => {
    const el = await mountTagged({
      ...BOARD,
      visible: [card('CMD-1', { clientele: 'public', siteId: 'adroit' })],
    });
    const tile = el.querySelector('[data-hit-key="CMD-1"]');
    expect(tile?.querySelector('[data-clientele]')?.textContent).toContain('Particulier');
    const mode = tile?.querySelector<HTMLElement>('[data-mode] .ls-swatch');
    expect(mode?.textContent?.trim()).toBe('Retrait Adroit');
    expect(mode?.style.backgroundColor).toBe('rgb(253, 216, 53)');
  });

  it('« Pro » et « Livraison » sur une carte colisée', async () => {
    const el = await mountTagged({
      ...BOARD,
      packed: [
        card('CMD-3', {
          state: 'packed',
          packedAt: '5 h 12',
          clientele: 'pro',
          method: 'delivery',
        }),
      ],
    });
    const tile = el.querySelector('[data-reference="CMD-3"]');
    expect(tile?.querySelector('[data-clientele]')?.textContent).toContain('Pro');
    expect(tile?.querySelector('[data-mode]')?.textContent?.trim()).toBe('Livraison');
  });

  it('🔴 sans clientèle connue, aucun badge — le mode reste', async () => {
    const el = await mountTagged(BOARD);
    const tile = el.querySelector('[data-reference="CMD-1"]');
    expect(tile?.querySelector('[data-clientele]')).toBeNull();
    expect(tile?.querySelector('[data-mode]')?.textContent?.trim()).toBe('Retrait Boutique');
  });
});
