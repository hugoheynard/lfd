import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  DaySupervisionView,
  HandoverQueueView,
  QualityBoardView,
  ProductionPackingView,
  ProductionWorksheetView,
  StaffPermission,
  StaffRole,
} from '@lfd/contracts';

import { FoldPanelHostService } from 'fold-ng';

import { type DayWatch, DayVersionWatcher } from '../../shared/day-version/day-version-watcher';
import { PermissionsStore } from '../../auth/permissions.store';
import { QualityService } from '../quality.service';
import { SupervisionService } from '../supervision.service';
import { shiftServiceDay } from '../supervision-day';
import { SupervisionPage } from './supervision-page';

/**
 * Le veilleur de journée, doublé : il garde la relecture que l'écran lui
 * confie, et le test la déclenche comme le ferait une version qui bouge.
 */
const watched: DayWatch[] = [];
const fakeWatcher = {
  watch: (spec: DayWatch): void => {
    watched.push(spec);
  },
};

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
      family: { id: 'v', name: 'Viennoiseries', position: 1 },
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
          produced: 0,
          remaining: 96,
          surplus: 0,
          batches: [],
          container: null,
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
      heldForQuality: false,
    },
  ],
};

const NO_CHECK: QualityBoardView = { date: DATE, lines: [], orders: [], heldOrderIds: [] };

interface Reads {
  quality?: () => Promise<QualityBoardView>;
  /** Ce que le panneau de contrôle rend en se fermant. */
  panel?: () => Promise<boolean | undefined>;
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
      { provide: DayVersionWatcher, useValue: fakeWatcher },
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
        provide: QualityService,
        useValue: { board: reads.quality ?? (() => Promise.resolve(NO_CHECK)) },
      },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: () => ({ closed: reads.panel?.() ?? Promise.resolve(undefined) }),
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

    // `undefined` et non une date : le service n'ajoute alors aucun `?date=`.
    expect(day).toHaveBeenCalledWith(undefined);
    expect(preparation).toHaveBeenCalledWith(DATE);
  });

  it('suit les deux journaux du jour affiché, et relit les colonnes quand l’un bouge', async () => {
    const preparation = vi.fn(() => Promise.resolve(WORKSHEET));
    const fixture = await mount({ preparation });
    const watch = watched.at(-1);

    expect(watch?.journals).toEqual(['commerce', 'supervision-production']);
    expect(watch?.date()).toBe(DATE);

    await watch?.reload();
    await fixture.whenStable();
    expect(preparation).toHaveBeenCalledTimes(2);
  });

  /** Hugo, 2026-09-28 : l'écran restait sur le jour du serveur, sans moyen de voir demain. */
  it('la recherche désigne une commande et la compte', async () => {
    const fixture = await mount();
    const search = root(fixture).querySelector<HTMLInputElement>('[data-search] input');
    const reference = QUEUE.entries[0]?.reference ?? '';

    search!.value = reference;
    search!.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root(fixture).querySelector(`[data-reference="${reference}"].is-match`)).not.toBeNull();
  });

  it('passe au lendemain : le jour et les trois colonnes sont relus à cette date', async () => {
    const day = vi.fn((date?: string) => Promise.resolve({ ...DAY, date: date ?? DATE }));
    const preparation = vi.fn(() => Promise.resolve(WORKSHEET));
    const fixture = await mount({ day, preparation });
    const next = shiftServiceDay(DATE, 1);

    const buttons = [...root(fixture).querySelectorAll<HTMLButtonElement>('[data-day-nav] button')];
    buttons.find((button) => button.textContent?.includes('Demain'))?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(day).toHaveBeenLastCalledWith(next);
    expect(preparation).toHaveBeenLastCalledWith(next);
    // Supervision v2, A2 : un autre jour que celui du serveur se DIT.
    expect(root(fixture).querySelector('[data-day-strip]')?.textContent).toContain(
      'Demain · à venir',
    );
  });

  it('le jour même, aucun bandeau ; « Revenir à aujourd’hui » relit sans date', async () => {
    const day = vi.fn((date?: string) => Promise.resolve({ ...DAY, date: date ?? DATE }));
    const fixture = await mount({ day });
    expect(root(fixture).querySelector('[data-day-strip]')).toBeNull();

    [...root(fixture).querySelectorAll<HTMLButtonElement>('[data-day-nav] button')]
      .find((button) => button.textContent?.includes('Hier'))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root(fixture).querySelector('[data-day-strip]')?.textContent).toContain(
      'Hier · relecture',
    );

    root(fixture).querySelector<HTMLButtonElement>('[data-day-strip] button')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(day).toHaveBeenLastCalledWith(undefined);
    expect(root(fixture).querySelector('[data-day-strip]')).toBeNull();
  });

  it('montre les trois colonnes, leur unité, et les compteurs', async () => {
    const fixture = await mount();

    expect(column(fixture, 'preparation')?.textContent).toContain("l'unité est le produit");
    expect(column(fixture, 'preparation')?.textContent).toContain('Pain au chocolat');
    expect(column(fixture, 'packing')?.textContent).toContain('attend le four');
    expect(column(fixture, 'handover')?.textContent).toContain(', 1 h 42');
    expect(column(fixture, 'preparation')?.querySelector('[data-count]')?.textContent).toContain(
      '1',
    );
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

  it('dit que la journée n’est pas arrêtée, et montre ce qu’elle attend', async () => {
    const fixture = await mount({ packing: () => Promise.resolve(packingView(null)) });
    const reference = QUEUE.entries[0]?.reference ?? '';

    // Au masthead : l'arrêt commande la préparation autant que le colisage.
    expect(root(fixture).querySelector('.masthead [data-not-closed]')?.textContent).toContain(
      'pas encore arrêté',
    );
    expect(
      column(fixture, 'packing')?.querySelector(`[data-reference="${reference}"]`),
    ).not.toBeNull();
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

    // Le seul champ est la recherche du masthead (Hugo, 2026-09-28) : elle
    // SURLIGNE, elle n'écrit rien. Aucune case, aucun autre champ.
    const inputs = Array.from(root(fixture).querySelectorAll('input'));
    expect(inputs.every((input) => input.closest('[data-search]') !== null)).toBe(true);
    expect(root(fixture).querySelector('input[type="checkbox"]')).toBeNull();
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

  it('pose chaque chiffre dans l’en-tête de sa colonne, la fraîcheur au masthead', async () => {
    const fixture = await mount();
    const masthead = root(fixture).querySelector('fold-page-section.masthead');

    expect(masthead?.getAttribute('data-surface')).toBe('chrome');
    // Supervision v2, A1 : les cartes compteurs ont quitté le masthead.
    expect(masthead?.querySelector('fold-card')).toBeNull();
    expect(column(fixture, 'packing')?.querySelector('[data-count]')?.textContent).toContain(
      'à coliser',
    );
    expect(masthead?.querySelector('[data-stamp]')?.textContent).toContain('à jour à 9 h 42');
    expect(root(fixture).querySelector('.bar')).toBeNull();
  });

  it('dit un blocage par une pastille d’état dans l’en-tête de la colonne qui le porte', async () => {
    const fixture = await mount();

    const oven = column(fixture, 'preparation')?.querySelector('[data-blocker="oven"] fold-badge');
    expect(oven?.classList).toContain('warning');
    expect(oven?.textContent).toContain('1 commande attend le four');
    // Colonne 3 : une seule pastille, qui ouvre la liste des causes.
    expect(
      column(fixture, 'handover')?.querySelector('[data-blocker-menu]')?.textContent,
    ).toContain('1 blocage');
    expect(column(fixture, 'packing')?.querySelector('[data-blocker]')).toBeNull();
  });

  it('précise retraits et livraisons dans le sous-titre de la colonne 3', async () => {
    const withDelivery: HandoverQueueView = {
      ...QUEUE,
      entries: [
        ...QUEUE.entries,
        { ...QUEUE.entries[0]!, orderId: 'o-d', reference: 'D', fulfillmentMethod: 'delivery' },
      ],
    };
    const fixture = await mount({ handover: () => Promise.resolve(withDelivery) });
    expect(column(fixture, 'handover')?.querySelector('[data-subtitle]')?.textContent).toContain(
      '· 1 livraison',
    );
  });

  /** Supervision v2, A5 : une pastille surligne ce qu'elle compte ; re-cliquée, elle s'éteint. */
  it('une pastille cliquée met en avant ce qu’elle compte, et ✕ efface tout', async () => {
    const fixture = await mount();
    const oven = (): HTMLButtonElement | null =>
      column(fixture, 'preparation')?.querySelector<HTMLButtonElement>('[data-blocker="oven"]') ??
      null;

    oven()?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(oven()?.classList).toContain('is-on');
    expect(column(fixture, 'preparation')?.querySelector('[data-hits]')).not.toBeNull();
    expect(root(fixture).querySelector('[data-hit-pos]')?.textContent).toMatch(/^1 \/ \d+$/u);

    root(fixture).querySelector<HTMLElement>('[data-hit-clear] button')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(oven()?.classList).not.toContain('is-on');
    expect(root(fixture).querySelector('[data-hit-nav]')).toBeNull();
  });

  /** `plan-controle-qualite.md`, D7 : « N commandes retenues » sur la carte Retrait. */
  it('dit les commandes retenues au masthead, et la ligne dit « Retenue »', async () => {
    const held: HandoverQueueView = {
      ...QUEUE,
      entries: [{ ...QUEUE.entries[0]!, heldForQuality: true }],
    };
    const fixture = await mount({ handover: () => Promise.resolve(held) });

    const badge = column(fixture, 'handover')?.querySelector('[data-blocker="held"] fold-badge');
    expect(badge?.classList).toContain('alert');
    expect(badge?.textContent).toContain('1 commande retenue');
    expect(column(fixture, 'handover')?.textContent).toContain(
      'Retenue · contrôle qualité bloquant',
    );
  });

  it('ne montre « Contrôler » qu’avec b2b_supervision:write', async () => {
    const reader = await mount();
    expect(root(reader).textContent).not.toContain('Contrôler');

    TestBed.resetTestingModule();
    const judge = await mount({}, ['b2b_supervision:read', 'b2b_supervision:write']);
    expect(column(judge, 'preparation')?.querySelector('[data-check="pac"]')).not.toBeNull();
  });

  it('relit la page après un verdict enregistré, pas après une annulation', async () => {
    const preparation = vi.fn(() => Promise.resolve(WORKSHEET));
    let saved = false;
    const fixture = await mount({ preparation, panel: () => Promise.resolve(saved) }, [
      'b2b_supervision:read',
      'b2b_supervision:write',
    ]);
    const button = (): HTMLButtonElement | null =>
      root(fixture).querySelector<HTMLButtonElement>('[data-check="pac"]');

    button()?.click();
    await fixture.whenStable();
    expect(preparation).toHaveBeenCalledTimes(1);

    saved = true;
    button()?.click();
    await fixture.whenStable();
    expect(preparation).toHaveBeenCalledTimes(2);
  });

  it('dit quand les pastilles n’ont pas pu être lues, sans vider les colonnes', async () => {
    const fixture = await mount({ quality: () => Promise.reject(new Error('503')) });

    expect(root(fixture).querySelector('[data-quality-failed]')?.getAttribute('variant')).toBe(
      'alert',
    );
    expect(column(fixture, 'preparation')?.textContent).toContain('Pain au chocolat');
  });
});
