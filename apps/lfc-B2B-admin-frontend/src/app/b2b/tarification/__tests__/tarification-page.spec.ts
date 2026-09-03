import { TestBed } from '@angular/core/testing';
import type {
  PriceRuleView,
  PriceStepView,
  PricingBoardView,
  PricingCategoryView,
  PricingItemView,
} from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ArchivePanel } from '../archive-panel/archive-panel';
import { FloorPanel } from '../floor-panel/floor-panel';
import { JournalPanel } from '../journal-panel/journal-panel';
import { TarificationPage } from '../tarification-page';
import { RulePanel } from '../rule-panel/rule-panel';
import { TarificationService } from '../tarification.service';

/**
 * Ce que la PAGE doit tenir, et que rien d'autre ne garde : les compteurs de
 * tête, l'ouverture des panneaux d'écriture, et la ligne dont on regarde le
 * chemin du prix.
 *
 * Ce qui appartient à la table d'un rayon — la limite héritée, la règle de
 * famille supplantée, la marge négociable — a suivi la table dans
 * `shelf-table.spec.ts` : c'est là que ces faits se rendent maintenant.
 */

const EMPTY_BOARD: PricingBoardView = {
  categories: [],
  globalFloor: null,
  globalRules: [],
  canonicalHistoryStartsAt: null,
  simulation: { quantity: 1, at: '2026-08-17T10:00:00.000Z', audience: 'all' },
};

function page(board: PricingBoardView = EMPTY_BOARD): TarificationPage {
  const service: Pick<TarificationService, 'read'> = { read: () => Promise.resolve(board) };

  TestBed.configureTestingModule({
    providers: [
      { provide: TarificationService, useValue: service },
      { provide: FoldPanelHostService, useValue: {} },
    ],
  });
  return TestBed.runInInjectionContext(() => new TarificationPage());
}

function rule(overrides: Partial<PriceRuleView> = {}): PriceRuleView {
  return {
    id: 'rule_1',
    stage: 'promotion',
    scope: { type: 'category', id: 'viennoiserie' },
    audience: { type: 'all', id: null },
    minQuantity: null,
    effect: { nature: 'alter', direction: 'decrease', mode: 'percent', value: 1000 },
    label: 'Promo de rentrée',
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: null,
    createdBy: 'staff',
    stacksOverMercuriale: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    pausedAt: null,
    pausedBy: null,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    ...overrides,
  };
}

function item(overrides: Partial<PricingItemView> = {}): PricingItemView {
  return {
    sku: 'VIE-001',
    name: 'Croissant',
    canonicalMillicents: 200,
    ownFloor: null,
    effectiveFloor: null,
    rules: [],
    supersededRuleIds: [],
    sealedByRuleId: null,
    sealedRuleIds: [],
    steps: [],
    floored: false,
    clampedToZero: false,
    finalMillicents: 200,
    volumeTiers: [],
    elasticity: null,
    negotiationRoom: null,
    ...overrides,
  };
}

/** Un étage qui a agi. `scope` et `supersedes` sont ce que la trace déplie. */
function step(overrides: Partial<PriceStepView> = {}): PriceStepView {
  return {
    stage: 'promotion',
    ruleId: 'rule_1',
    label: 'Promo',
    scope: { type: 'product', id: 'VIE-001' },
    resultMillicents: 180,
    supersedes: [],
    ...overrides,
  };
}

function category(overrides: Partial<PricingCategoryView> = {}): PricingCategoryView {
  return {
    id: 'viennoiserie',
    name: 'Viennoiseries',
    vatRatePercent: 5.5,
    floor: null,
    rules: [],
    overlaps: [],
    ladders: [],
    items: [item()],
    ...overrides,
  };
}

describe('les compteurs de tête', () => {
  it('compte les prix que la limite a relevés — le chiffre qui alerte', async () => {
    const screen = page({
      ...EMPTY_BOARD,
      categories: [
        category({
          items: [item({ floored: true }), item({ sku: 'VIE-002' })],
        }),
      ],
    });
    await screen['load']();

    expect(screen['flooredCount']()).toBe(1);
  });

  it("compte les articles qu'au moins un étage a touchés", async () => {
    const touche = item({
      steps: [step()],
      finalMillicents: 180,
    });
    const screen = page({ ...EMPTY_BOARD, categories: [category({ items: [touche, item()] })] });
    await screen['load']();

    expect(screen['alteredCount']()).toBe(1);
  });
});

/**
 * **Un seul bouton pour deux gestes**, parce que c'est un seul geste vu de
 * l'utilisateur : arrêter ce qui tourne, rallumer ce qui est arrêté.
 */
describe('suspendre et reprendre', () => {
  /** Hôte de panneaux doublé : on note ce qui s'ouvre, sans monter de panneau. */
  function panelHost(opened: unknown[]): { open: (component: unknown) => unknown } {
    return {
      open: (component) => {
        opened.push(component);
        return { closed: Promise.resolve(false) };
      },
    };
  }

  function pageWith(calls: string[], opened: unknown[] = []): TarificationPage {
    const service: Pick<TarificationService, 'read' | 'pauseRule' | 'resumeRule' | 'archiveRule'> =
      {
        read: () => Promise.resolve(EMPTY_BOARD),
        pauseRule: (id) => {
          calls.push(`pause:${id}`);
          return Promise.resolve();
        },
        resumeRule: (id) => {
          calls.push(`resume:${id}`);
          return Promise.resolve();
        },
        archiveRule: (id) => {
          calls.push(`archive:${id}`);
          return Promise.resolve();
        },
      };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: TarificationService, useValue: service },
        { provide: FoldPanelHostService, useValue: panelHost(opened) },
      ],
    });
    return TestBed.runInInjectionContext(() => new TarificationPage());
  }

  it('suspend une règle en vigueur', async () => {
    const calls: string[] = [];

    await pageWith(calls)['toggleRule'](rule());

    expect(calls).toContain('pause:rule_1');
  });

  it('reprend une règle suspendue', async () => {
    const calls: string[] = [];

    await pageWith(calls)['toggleRule'](rule({ status: 'paused' }));

    expect(calls).toContain('resume:rule_1');
  });

  /**
   * Retirer n'archive pas tout de suite : il **demande pourquoi**. Le motif est
   * la seule réponse qu'aura celui qui relira dans six mois, et « êtes-vous
   * sûr ? » ne l'aurait pas récoltée.
   */
  it("retire en DEMANDANT le motif, jamais d'un seul clic", async () => {
    const calls: string[] = [];
    const opened: unknown[] = [];

    await pageWith(calls, opened)['removeRule'](rule());

    expect(opened).toContain(ArchivePanel);
    expect(calls).toEqual([]);
  });

  it('ouvre le journal de la règle depuis son nœud', async () => {
    const opened: unknown[] = [];

    await pageWith([], opened)['openRuleJournal'](rule());

    expect(opened).toContain(JournalPanel);
  });

  /**
   * La limite du catalogue et ses altérations existaient dans le modèle et
   * n'étaient visibles nulle part : la bande du haut est leur seul accès.
   */
  it('ouvre la limite de tout le catalogue', async () => {
    const opened: unknown[] = [];

    pageWith([], opened)['editGlobalFloor']();
    await Promise.resolve();

    expect(opened).toContain(FloorPanel);
  });

  it('ouvre la pose d’une altération sur tout le catalogue', async () => {
    const opened: unknown[] = [];

    pageWith([], opened)['addGlobalRule']();
    await Promise.resolve();

    expect(opened).toContain(RulePanel);
  });
});

/**
 * **La sélection de ligne**, que cet écran n'avait pas.
 *
 * Elle n'existe que pour le chemin du prix : dépliée sur cent articles, la
 * cascade serait illisible, donc la trace montre un article à la fois — et il
 * faut bien désigner lequel.
 */
describe('la ligne dont on regarde le chemin du prix', () => {
  const board = (items: readonly PricingItemView[]): PricingBoardView => ({
    ...EMPTY_BOARD,
    categories: [category({ items: [...items] })],
  });

  it('ne montre aucune trace tant qu’aucune ligne n’est choisie', async () => {
    const screen = page(board([item()]));
    await screen['load']();

    expect(screen['selectedItem']()).toBeNull();
  });

  it('désigne l’article choisi, et lui seul', async () => {
    const screen = page(board([item(), item({ sku: 'VIE-002', name: 'Pain au chocolat' })]));
    await screen['load']();

    screen['toggleSelection'](item({ sku: 'VIE-002' }));

    expect(screen['selectedItem']()?.sku).toBe('VIE-002');
  });

  /** Ouvrir et refermer sont le même geste sur la ligne. */
  it('referme au second clic sur la même ligne', async () => {
    const screen = page(board([item()]));
    await screen['load']();

    screen['toggleSelection'](item());
    screen['toggleSelection'](item());

    expect(screen['selectedItem']()).toBeNull();
  });

  /**
   * **La trace suit le rechargement.** Poser une règle recharge depuis le
   * serveur et reconstruit des objets neufs : une sélection tenue par référence
   * se perdrait exactement au moment où l'on veut voir ce qu'elle a changé.
   */
  it('retrouve l’article après un rechargement qui l’a modifié', async () => {
    const before = board([item({ finalMillicents: 200 })]);
    const after = board([item({ finalMillicents: 180 })]);
    let served = before;
    const service: Pick<TarificationService, 'read'> = { read: () => Promise.resolve(served) };

    TestBed.configureTestingModule({
      providers: [
        { provide: TarificationService, useValue: service },
        { provide: FoldPanelHostService, useValue: {} },
      ],
    });
    const screen = TestBed.runInInjectionContext(() => new TarificationPage());
    await screen['load']();
    screen['toggleSelection'](item());

    served = after;
    await screen['load']();

    expect(screen['selectedItem']()?.finalMillicents).toBe(180);
  });

  /** Un article qui disparaît du tableau ne laisse pas une trace fantôme. */
  it('oublie la trace d’un article que le tableau ne porte plus', async () => {
    const screen = page(board([item()]));
    await screen['load']();
    screen['toggleSelection'](item());

    screen['board'].set(board([item({ sku: 'VIE-999' })]));

    expect(screen['selectedItem']()).toBeNull();
  });
});
