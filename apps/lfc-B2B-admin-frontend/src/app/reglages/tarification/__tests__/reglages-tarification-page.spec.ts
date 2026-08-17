import { TestBed } from '@angular/core/testing';
import type {
  ElasticityComparison,
  ItemElasticityView,
  PriceFloorView,
  PriceRuleView,
  PricingBoardView,
  PricingCategoryView,
  PricingItemView,
} from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ReglagesTarificationPage } from '../reglages-tarification-page';
import { TarificationService } from '../tarification.service';

/**
 * Ce que cet écran doit dire **sans se tromper**, et que rien d'autre ne garde :
 *
 * - une règle de famille **supplantée** doit se voir barrée. Sans ça, le lecteur
 *   aligne deux remises dont une seule agit et additionne les deux ;
 * - une limite **héritée** doit se distinguer d'une limite posée ici, parce que
 *   poser la sienne fait sauter celle dont on hérite ;
 * - la mise en forme d'une règle doit dire l'étage, le sens et l'unité — c'est
 *   tout ce que le nœud montre.
 */

const EMPTY_BOARD: PricingBoardView = {
  categories: [],
  globalFloor: null,
  globalRules: [],
  simulation: { quantity: 1, at: '2026-08-17T10:00:00.000Z', audience: 'all' },
};

function page(board: PricingBoardView = EMPTY_BOARD): ReglagesTarificationPage {
  const service: Pick<TarificationService, 'read'> = { read: () => Promise.resolve(board) };

  TestBed.configureTestingModule({
    providers: [
      { provide: TarificationService, useValue: service },
      { provide: FoldPanelHostService, useValue: {} },
    ],
  });
  return TestBed.runInInjectionContext(() => new ReglagesTarificationPage());
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

function floor(overrides: Partial<PriceFloorView> = {}): PriceFloorView {
  return {
    id: 'category:viennoiserie',
    scope: { type: 'category', id: 'viennoiserie' },
    mode: 'amount',
    value: 150,
    // Le mur seul : la porte n'est pas ce que ces cas mesurent.
    dynamic: null,
    // Le tarif n'a pas bougé sous cette limite.
    drift: null,
    createdBy: 'staff',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function item(overrides: Partial<PricingItemView> = {}): PricingItemView {
  return {
    sku: 'VIE-001',
    name: 'Croissant',
    canonicalCents: 200,
    ownFloor: null,
    effectiveFloor: null,
    rules: [],
    supersededRuleIds: [],
    steps: [],
    floored: false,
    finalCents: 200,
    elasticity: null,
    negotiationRoom: null,
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
    items: [item()],
    ...overrides,
  };
}

describe('la limite héritée', () => {
  /**
   * Poser sa propre limite fait sauter celle dont on hérite — y compris vers le
   * bas. Confondre les deux à l'écran ferait prendre un remplacement pour un
   * cumul.
   */
  it("distingue une limite reçue d'une limite posée ici", () => {
    const screen = page();
    const heritee = item({ ownFloor: null, effectiveFloor: floor() });
    const propre = item({ ownFloor: floor(), effectiveFloor: floor() });

    expect(screen['isInherited'](heritee)).toBe(true);
    expect(screen['isInherited'](propre)).toBe(false);
  });

  it("ne parle pas d'héritage quand aucune limite ne s'applique", () => {
    expect(page()['isInherited'](item())).toBe(false);
  });
});

describe('la règle supplantée', () => {
  /**
   * Le point que l'écran doit dire : dans un même étage, la règle d'article
   * REMPLACE celle de la famille. Elles ne s'enchaînent pas.
   */
  it('signale une règle de famille évincée par un article du rayon', () => {
    const evincee = rule({ id: 'rule_famille' });
    const shelf = category({
      rules: [evincee],
      items: [item({ supersededRuleIds: ['rule_famille'] }), item({ sku: 'VIE-002' })],
    });

    expect(page()['isSuperseded'](evincee, shelf)).toBe(true);
  });

  it('laisse intacte une règle que personne n’évince', () => {
    const seule = rule({ id: 'rule_famille' });

    expect(page()['isSuperseded'](seule, category({ rules: [seule] }))).toBe(false);
  });
});

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
      steps: [{ stage: 'promotion', ruleId: 'rule_1', label: 'Promo', resultCents: 180 }],
      finalCents: 180,
    });
    const screen = page({ ...EMPTY_BOARD, categories: [category({ items: [touche, item()] })] });
    await screen['load']();

    expect(screen['alteredCount']()).toBe(1);
  });
});

function comparison(overrides: Partial<ElasticityComparison> = {}): ElasticityComparison {
  const window = { from: '2026-07-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z', days: 30 };
  return {
    baseline: window,
    baselineVolume: 400,
    observed: window,
    observedVolume: 460,
    targetVolume: 500,
    attainmentBp: 9_200,
    conclusive: true,
    ...overrides,
  };
}

function elasticity(overrides: Partial<ItemElasticityView> = {}): ItemElasticityView {
  return {
    fromCents: 200,
    toCents: 160,
    isoRevenueRatioBp: 12_500,
    sinceChange: comparison(),
    rolling: comparison(),
    ...overrides,
  };
}

describe("l'effort de volume", () => {
  /** Le chiffre qui doit sauter aux yeux, dans la langue du commercial. */
  it('dit le ratio en clair, à la virgule française', () => {
    expect(page()['ratioLabel'](elasticity())).toBe('×1,25');
  });

  /**
   * Un article offert n'atteint le chiffre d'origine à aucun volume. « ×∞ »
   * n'aide personne — l'écran dira autre chose à la place.
   */
  it("n'invente pas de ratio sur un article offert", () => {
    expect(page()['ratioLabel'](elasticity({ isoRevenueRatioBp: null }))).toBeNull();
  });

  it("dit l'atteinte en pourcent entier", () => {
    expect(page()['attainmentLabel'](comparison())).toBe('92 %');
  });

  it("n'annonce pas d'atteinte quand il n'y a pas d'objectif", () => {
    expect(page()['attainmentLabel'](comparison({ attainmentBp: null }))).toBeNull();
  });

  /**
   * Seul l'objectif TENU se colore. Peindre en rouge tout ce qui est sous 100 %
   * ferait paniquer sur des remises trop récentes pour avoir produit quoi que ce
   * soit — c'est le rôle de `conclusive`, pas d'une couleur.
   */
  it('ne signale que la réussite, jamais le retard', () => {
    const screen = page();

    expect(screen['isOnTrack'](comparison({ attainmentBp: 10_000 }))).toBe(true);
    expect(screen['isOnTrack'](comparison({ attainmentBp: 9_900 }))).toBe(false);
    expect(screen['isOnTrack'](comparison({ attainmentBp: null }))).toBe(false);
  });
});

describe('la remise accordable', () => {
  const room = { floorCents: 150, maxDiscountCents: 50, maxDiscountBp: 2_500 };

  /**
   * Les deux unités sont rendues séparément et au même poids : le commercial
   * choisit celle qu'il annonce, l'écran ne choisit pas pour lui.
   */
  it('donne les euros et les pourcents, chacun mis en forme pour être lu', () => {
    const screen = page();

    expect(screen['roomEuros'](room)).toContain('0,50');
    expect(screen['roomPercent'](room)).toBe('25,0 %');
  });
});

/**
 * **Un seul bouton pour deux gestes**, parce que c'est un seul geste vu de
 * l'utilisateur : arrêter ce qui tourne, rallumer ce qui est arrêté.
 */
describe('suspendre et reprendre', () => {
  /** Hôte de panneaux doublé : on note ce qui s'ouvre, sans monter de panneau. */
  function panelHost(opened: string[]): { open: (component: { name: string }) => unknown } {
    return {
      open: (component) => {
        opened.push(component.name);
        return { closed: Promise.resolve(false) };
      },
    };
  }

  function pageWith(calls: string[], opened: string[] = []): ReglagesTarificationPage {
    const service: Pick<TarificationService, 'read' | 'pauseRule' | 'resumeRule' | 'archiveRule'> =
      {
        read: () => Promise.resolve(board),
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
    return TestBed.runInInjectionContext(() => new ReglagesTarificationPage());
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
    const opened: string[] = [];

    await pageWith(calls, opened)['removeRule'](rule());

    expect(opened).toContain('ArchivePanel');
    expect(calls).toEqual([]);
  });

  it('ouvre le journal de la règle depuis son nœud', async () => {
    const opened: string[] = [];

    await pageWith([], opened)['openRuleJournal'](rule());

    expect(opened).toContain('JournalPanel');
  });
});
