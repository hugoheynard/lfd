import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  DaySupervisionView,
  HandoverQueueView,
  ProductionPackingView,
  ProductionWorksheetView,
  StaffPermission,
  StaffRole,
} from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { SupervisionService } from '../supervision.service';
import { SupervisionPage } from './supervision-page';

const DATE = '2026-09-25';

const DAY: DaySupervisionView = {
  date: DATE,
  asOf: '2026-09-25T07:42:00.000Z',
  flow: [],
  late: [
    {
      orderId: 'o-late',
      reference: 'LATE',
      customerName: 'Boulangerie Saint-Roch',
      fulfillmentMethod: 'pickup',
      window: { start: '07:00', end: '08:00', source: 'override' },
      stage: 'ready',
      rule: 'not_handed_over_after_window',
    },
  ],
  undated: 0,
};

const WORKSHEET: ProductionWorksheetView = {
  date: DATE,
  generatedAt: 'x',
  retakenAt: null,
  lines: [],
  drift: null,
  shelvesKnown: true,
  relativeDay: 'today',
  groups: [
    {
      key: 'v',
      category: null,
      label: 'Viennoiseries',
      lineCount: 2,
      doneCount: 1,
      totalUnits: 146,
      remainingUnits: 96,
      doneUnits: 50,
      lines: [],
      done: [],
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
    },
  ],
};

function packingView(closedAt: string | null = 'x'): ProductionPackingView {
  return {
    date: DATE,
    closedAt,
    resources: [],
    orderCount: 1,
    todoCount: 1,
    readyCount: 0,
    relativeDay: 'today',
    sheets:
      closedAt === null
        ? []
        : [
            {
              reference: 'CMD-1',
              containers: 2,
              customerLabel: 'Traiteur Vermeil',
              fulfillmentMethod: 'pickup',
              destination: 'Boutique',
              lineCount: 1,
              packedLines: 0,
              remainingLines: 1,
              pieces: 12,
              packedPieces: 0,
              canDeclareReady: false,
              packedAt: null,
              packedBy: null,
              packedByName: null,
              lines: [
                {
                  sku: 'e',
                  productName: 'Éclair',
                  quantity: 12,
                  packed: false,
                  initials: null,
                  packedAt: null,
                  awaitingProduction: true,
                },
              ],
            },
          ],
  };
}

const QUEUE: HandoverQueueView = {
  day: DATE,
  entries: [
    {
      orderId: 'o-late',
      reference: 'LATE',
      customerLabel: 'Boulangerie Saint-Roch',
      tradeName: null,
      clientele: 'pro',
      pickupLabel: 'Boutique',
      fulfillmentMethod: 'pickup',
      window: { start: '07:00', end: '08:00', source: 'override' },
      totalUnits: 4,
      placedAt: 'x',
      state: 'ready',
      handedOverAt: null,
      handedOverVia: null,
      readyAt: null,
    },
  ],
};

interface Reads {
  day?: () => Promise<DaySupervisionView>;
  preparation?: () => Promise<ProductionWorksheetView>;
  packing?: () => Promise<ProductionPackingView>;
  handover?: () => Promise<HandoverQueueView>;
}

async function mount(
  reads: Reads = {},
  permissions: readonly StaffPermission[] = ['b2b_supervision:read', 'b2b_orders:read'],
  role: StaffRole = 'admin',
) {
  const granted = signal(permissions);
  TestBed.configureTestingModule({
    imports: [SupervisionPage],
    providers: [
      provideRouter([]),
      {
        provide: SupervisionService,
        useValue: {
          day: reads.day ?? (() => Promise.resolve(DAY)),
          preparation: reads.preparation ?? (() => Promise.resolve(WORKSHEET)),
          packing: reads.packing ?? (() => Promise.resolve(packingView())),
          handover: reads.handover ?? (() => Promise.resolve(QUEUE)),
        },
      },
      {
        provide: PermissionsStore,
        useValue: {
          can: (p: StaffPermission): boolean => granted().includes(p),
          identity: () => ({ role }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SupervisionPage);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function root(fixture: { nativeElement: HTMLElement }): HTMLElement {
  return fixture.nativeElement;
}

function column(fixture: { nativeElement: HTMLElement }, key: string): HTMLElement | null {
  return root(fixture).querySelector<HTMLElement>(`[data-column="${key}"]`);
}

/** Les mots des gestes de la maquette : aucun ne doit survivre dans une vue qui n'agit pas. */
const GESTURES = /Remettre|Scanner|Appeler|Étiquettes|Bon de commande|Cocher/u;

afterEach(() => {
  vi.unstubAllGlobals();
});

/** `min-height: 0`, que jsdom rend tel qu'écrit. */
const ZERO = /^0(px)?$/u;

describe('SupervisionPage', () => {
  it('lit le jour au serveur, sans date, puis les trois colonnes à ce jour-là', async () => {
    const day = vi.fn(() => Promise.resolve(DAY));
    const preparation = vi.fn(() => Promise.resolve(WORKSHEET));
    await mount({ day, preparation });

    expect(day).toHaveBeenCalledWith();
    expect(preparation).toHaveBeenCalledWith(DATE);
  });

  it('montre les trois colonnes, leur unité, et les compteurs', async () => {
    const fixture = await mount();

    expect(column(fixture, 'preparation')?.textContent).toContain("l'unité est le produit");
    expect(column(fixture, 'preparation')?.textContent).toContain('Pain au chocolat');
    expect(column(fixture, 'packing')?.textContent).toContain('attend le four');
    expect(column(fixture, 'packing')?.textContent).toContain('Éclair');
    expect(column(fixture, 'handover')?.textContent).toContain('créneau dépassé de 102 min');
    expect(root(fixture).querySelector('[data-counter="preparation"]')?.textContent).toContain('1');
    expect(root(fixture).querySelector('[data-stamp]')?.textContent).toContain('à jour à 9 h 42');
  });

  it('une lecture qui échoue n’efface pas les autres : chaque colonne a son état', async () => {
    const fixture = await mount({ packing: () => Promise.reject(new Error('503')) });

    const failed = column(fixture, 'packing')?.querySelector('fold-empty-state');
    expect(failed?.getAttribute('tone')).toBe('alert');
    expect(failed?.querySelector('button')?.textContent).toContain('Réessayer');
    expect(column(fixture, 'preparation')?.textContent).toContain('Viennoiseries');
    expect(column(fixture, 'handover')?.textContent).toContain('Boulangerie Saint-Roch');
  });

  it('sans le jour du serveur, aucune colonne ne sait quoi lire', async () => {
    const preparation = vi.fn(() => Promise.resolve(WORKSHEET));
    const fixture = await mount({ day: () => Promise.reject(new Error('503')), preparation });

    expect(root(fixture).querySelectorAll('fold-empty-state[tone="alert"]')).toHaveLength(3);
    expect(preparation).not.toHaveBeenCalled();
  });

  it('dit que la journée n’est pas arrêtée plutôt qu’une colonne vide', async () => {
    const fixture = await mount({ packing: () => Promise.resolve(packingView(null)) });

    expect(column(fixture, 'packing')?.textContent).toContain(
      "La journée n'est pas encore arrêtée",
    );
    expect(column(fixture, 'packing')?.textContent).toContain('Le colisage commence à la clôture.');
  });

  it('montre les renvois à qui peut ouvrir les postes', async () => {
    const fixture = await mount();

    const targets = Array.from(root(fixture).querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    );
    expect(targets).toContain('/production/journee');
    expect(targets).toContain('/comptoir/retrait');
  });

  it('masque les renvois sans b2b_orders:read', async () => {
    const fixture = await mount({}, ['b2b_supervision:read']);

    expect(root(fixture).querySelectorAll('a')).toHaveLength(0);
    expect(root(fixture).textContent).not.toContain('Ouvrir');
  });

  it('n’a aucun bouton d’action : ni geste, ni case à cocher', async () => {
    const fixture = await mount();

    expect(root(fixture).querySelector('input')).toBeNull();
    const controls = Array.from(root(fixture).querySelectorAll('button, a'));
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(control.textContent ?? '').not.toMatch(GESTURES);
    }
    expect(root(fixture).textContent).not.toMatch(GESTURES);
  });

  it('en mobile, le rôle choisit l’onglet d’arrivée', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));

    const fixture = await mount({}, undefined, 'comptoir');

    expect(column(fixture, 'handover')).not.toBeNull();
    expect(column(fixture, 'preparation')).toBeNull();
    expect(column(fixture, 'packing')).toBeNull();
  });

  it('en mobile, un blocage voisin revient en pastille sur son onglet', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));

    const fixture = await mount();

    const badges = Array.from(root(fixture).querySelectorAll('fold-view-nav fold-badge')).map(
      (badge) => badge.textContent?.trim(),
    );
    // Une commande attend le four (→ Préparation), un créneau est dépassé (→ Retrait).
    expect(badges).toEqual(['1', '1']);
  });

  it('ne défile pas : la chaîne flex tient la hauteur jusqu’aux colonnes', async () => {
    const fixture = await mount();
    const style = (selector: string): CSSStyleDeclaration =>
      getComputedStyle(root(fixture).querySelector(selector) ?? root(fixture));

    expect(style('.board').minHeight).toMatch(ZERO);
    expect(style('.columns').minHeight).toMatch(ZERO);
    expect(style('[data-column="packing"]').minHeight).toMatch(ZERO);
    expect(style('.board').overflowY).not.toBe('auto');
  });

  it('pose les trois chiffres et la fraîcheur dans le masthead, sans barre graphite', async () => {
    const fixture = await mount();
    const masthead = root(fixture).querySelector('fold-page-section.masthead');

    expect(masthead?.getAttribute('data-surface')).toBe('chrome');
    const packing = masthead?.querySelector('fold-card[data-counter="packing"]');
    expect(packing?.textContent).toContain('Colisage');
    expect(packing?.textContent).toContain('commandes à coliser');
    expect(masthead?.querySelector('[data-stamp]')?.textContent).toContain('à jour à 9 h 42');
    expect(root(fixture).querySelector('.bar')).toBeNull();
  });

  it('garde le segmenté hors du corps qui défile, et bascule la colonne 3', async () => {
    const fixture = await mount();
    const handover = column(fixture, 'handover');

    const toggle = handover?.querySelector('fold-view-toggle');
    expect(toggle?.closest('.tools')).not.toBeNull();
    expect(toggle?.closest('.body')).toBeNull();
    const segments = Array.from(toggle?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    expect(segments.map((segment) => segment.textContent?.trim())).toEqual([
      'Retrait · 1',
      'Livraison · 0',
    ]);
    segments[1]?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(handover?.textContent).toContain('Aucune livraison ce jour');
  });

  it('dit un blocage par une pastille d’état sur la carte qui le porte', async () => {
    const fixture = await mount();
    const card = (key: string) => root(fixture).querySelector(`fold-card[data-counter="${key}"]`);

    const oven = card('preparation')?.querySelector('fold-badge');
    expect(oven?.getAttribute('variant')).toBe('warning');
    expect(oven?.textContent).toContain('1 commande attend le four');
    const overdue = card('handover')?.querySelector('fold-badge');
    expect(overdue?.getAttribute('variant')).toBe('alert');
    expect(overdue?.textContent).toContain('1 créneau dépassé');
    expect(card('packing')?.querySelector('fold-badge')).toBeNull();
  });

  it('précise les livraisons dans la carte du retrait, seulement s’il y en a', async () => {
    const withDelivery: HandoverQueueView = {
      ...QUEUE,
      entries: [
        ...QUEUE.entries,
        { ...QUEUE.entries[0]!, orderId: 'o-d', reference: 'D', fulfillmentMethod: 'delivery' },
      ],
    };
    const plain = await mount();
    expect(
      root(plain).querySelector('fold-card[data-counter="handover"]')?.textContent,
    ).not.toContain('dont');
    TestBed.resetTestingModule();
    const fixture = await mount({ handover: () => Promise.resolve(withDelivery) });
    expect(
      root(fixture).querySelector('fold-card[data-counter="handover"]')?.textContent,
    ).toContain('attendues · dont 1 livraison');
  });
});
