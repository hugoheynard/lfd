import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type {
  PriceFloorView,
  PriceRuleView,
  PricingCategoryView,
  PricingItemView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ShelfTable } from '../shelf-table/shelf-table';

/**
 * **La table d'un rayon.**
 *
 * Trois choses qu'elle doit dire sans se tromper, et que rien d'autre ne garde :
 *
 * - une limite **héritée** se distingue d'une limite posée ici, parce que poser
 *   la sienne fait sauter celle dont on hérite — y compris vers le bas ;
 * - une règle de famille **supplantée** se voit barrée, sinon le lecteur aligne
 *   deux remises dont une seule agit et additionne les deux ;
 * - la ligne dont le chemin du prix est déplié se **voit**. Une sélection muette
 *   rendrait la trace introuvable : on ne devine pas qu'une ligne s'ouvre.
 */

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

function floor(overrides: Partial<PriceFloorView> = {}): PriceFloorView {
  return {
    id: 'category:viennoiserie',
    scope: { type: 'category', id: 'viennoiserie' },
    mode: 'amount',
    value: 150_000,
    dynamic: null,
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
    canonicalMillicents: 200_000,
    ownFloor: null,
    effectiveFloor: null,
    rules: [],
    supersededRuleIds: [],
    sealedByRuleId: null,
    sealedRuleIds: [],
    steps: [],
    floored: false,
    clampedToZero: false,
    finalMillicents: 200_000,
    volumeTiers: [],
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
    overlaps: [],
    ladders: [],
    items: [item()],
    ...overrides,
  };
}

function mount(
  view: PricingCategoryView,
  selectedSku: string | null = null,
): ComponentFixture<ShelfTable> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(ShelfTable);
  fixture.componentRef.setInput('category', view);
  fixture.componentRef.setInput('selectedSku', selectedSku);
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<ShelfTable>): string =>
  String(fixture.nativeElement.textContent ?? '');

describe('la limite héritée', () => {
  /**
   * Poser sa propre limite fait sauter celle dont on hérite — y compris vers le
   * bas. Confondre les deux à l'écran ferait prendre un remplacement pour un
   * cumul.
   */
  it("distingue une limite reçue d'une limite posée ici", () => {
    const table = mount(category()).componentInstance;

    expect(table['isInherited'](item({ ownFloor: null, effectiveFloor: floor() }))).toBe(true);
    expect(table['isInherited'](item({ ownFloor: floor(), effectiveFloor: floor() }))).toBe(false);
  });

  it("ne parle pas d'héritage quand aucune limite ne s'applique", () => {
    expect(mount(category()).componentInstance['isInherited'](item())).toBe(false);
  });

  it('écrit la limite héritée et dit qu’elle a relevé le prix', () => {
    const raised = item({ effectiveFloor: floor(), floored: true });

    expect(text(mount(category({ items: [raised] })))).toContain('héritée · a relevé');
  });
});

describe('la règle supplantée', () => {
  /**
   * Le point que l'écran doit dire : dans un même étage, la règle d'article
   * REMPLACE celle de la famille. Elles ne s'enchaînent pas.
   */
  it('signale une règle de famille évincée par un article du rayon', () => {
    const evicted = rule({ id: 'rule_famille' });
    const shelf = category({
      rules: [evicted],
      items: [item({ supersededRuleIds: ['rule_famille'] }), item({ sku: 'VIE-002' })],
    });

    expect(mount(shelf).componentInstance['isSuperseded'](evicted)).toBe(true);
  });

  it('laisse intacte une règle que personne n’évince', () => {
    const alone = rule({ id: 'rule_famille' });

    expect(mount(category({ rules: [alone] })).componentInstance['isSuperseded'](alone)).toBe(
      false,
    );
  });

  /**
   * Le nœud de famille est **unique** : il ne peut pas être barré pour un
   * article et pas pour son voisin. Le barré seul ferait donc lire « évincée
   * partout », ce qui est faux dès qu'un seul article la porte.
   */
  it('écrit que l’éviction ne vaut que sur certains articles', () => {
    const evicted = rule({ id: 'rule_famille' });
    const shelf = category({
      rules: [evicted],
      items: [item({ supersededRuleIds: ['rule_famille'] }), item({ sku: 'VIE-002' })],
    });

    expect(text(mount(shelf))).toContain('supplantée sur certains articles');
  });
});

describe('la remise accordable', () => {
  const room = { floorMillicents: 150_000, maxDiscountMillicents: 50_000, maxDiscountBp: 2_500 };

  /**
   * Les DEUX unités au même poids : le commercial choisit celle qu'il annonce au
   * téléphone, l'écran ne choisit pas pour lui.
   */
  it('donne les euros et les pourcents, chacun mis en forme pour être lu', () => {
    const rendered = text(mount(category({ items: [item({ negotiationRoom: room })] })));

    expect(rendered).toContain('0,50');
    expect(rendered).toContain('25,0 %');
  });

  /** Sans limite posée il n'y a pas de marge définie — et pas de « 0 € ». */
  it('ne chiffre aucune marge quand aucune limite n’est posée', () => {
    expect(text(mount(category()))).toContain('aucune limite posée');
  });
});

describe('la ligne dont on regarde le chemin du prix', () => {
  /**
   * **La sélection ne partage PAS le canal du ton de ligne.** L'ambre y dit
   * qu'une limite a relevé le prix ; le lui prêter donnait à une ligne
   * simplement choisie l'exacte apparence d'une ligne en défaut. La sélection se
   * marque dans la cellule d'identité, où `aria-pressed` la porte aussi pour qui
   * n'a pas la couleur.
   */
  it('ne teinte pas la ligne choisie comme une ligne en défaut', () => {
    const shelf = category({ items: [item(), item({ sku: 'VIE-002' })] });
    const table = mount(shelf, 'VIE-002').componentInstance;

    expect(table['rowTone'](item({ sku: 'VIE-002' }))).toBeNull();
  });

  it('marque la ligne choisie dans sa cellule d’identité', () => {
    expect(mount(category(), 'VIE-001').nativeElement.innerHTML).toContain('aria-pressed="true"');
    expect(mount(category()).nativeElement.innerHTML).toContain('aria-pressed="false"');
  });

  it('dit sur la ligne choisie que sa trace est affichée plus haut', () => {
    expect(text(mount(category(), 'VIE-001'))).toContain('chemin du prix affiché ↑');
  });

  it('invite les autres lignes à s’ouvrir', () => {
    expect(text(mount(category()))).toContain('voir le chemin du prix');
  });
});

/**
 * **Le ton de ligne dit l'état du prix.** Une ligne en ambre est une ligne où
 * une règle n'a pas produit son effet ; une ligne en rouge est la boutique qui
 * donne la marchandise. Les deux faits sont aussi ÉCRITS dans la cellule du prix
 * final, donc la couleur ne les porte jamais seule.
 */
describe('le ton de ligne', () => {
  it('teinte en avertissement la ligne qu’une limite a relevée', () => {
    const table = mount(category()).componentInstance;

    expect(table['rowTone'](item({ floored: true }))).toBe('warning');
    expect(table['rowTone'](item())).toBeNull();
  });

  /** Un prix ramené à zéro passe devant : c'est le plus grave des deux. */
  it('fait passer le prix ramené à zéro devant la limite', () => {
    const table = mount(category()).componentInstance;

    expect(table['rowTone'](item({ floored: true, clampedToZero: true }))).toBe('alert');
  });
});

describe('l’en-tête de rayon', () => {
  /**
   * **L'altération de famille est UNE décision pour tout le rayon.** Elle
   * occupait une colonne fusionnée sur toute la hauteur — une forme qui le
   * disait, au prix d'une colonne que rien ne remplissait. Dans l'en-tête, elle
   * est voisine de la limite de famille, et les deux se lisent ensemble.
   */
  it('porte les deux décisions de rayon : sa limite et ses altérations', () => {
    const shelf = category({ rules: [rule()], floor: floor() });
    const rendered = text(mount(shelf));

    expect(rendered).toContain('Promotion −10 %');
    expect(rendered).toContain('Limite : 1,50');
  });

  it('propose de poser une limite de famille quand il n’y en a pas', () => {
    expect(text(mount(category()))).toContain('Limite de famille');
  });
});
