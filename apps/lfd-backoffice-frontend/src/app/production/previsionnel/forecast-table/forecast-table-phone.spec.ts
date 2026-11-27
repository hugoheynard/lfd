import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FoldListboxComponent } from 'fold-ng';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ForecastTable } from './forecast-table';
import { phoneDayTotals, rayonsToDo } from './phone-day';
import type { ForecastCell, ForecastProduct, ForecastRayon } from '../previsionnel-matrix';
import { DAY_FOOT_ROWS, dayColumns, type ForecastHeader } from '../previsionnel-range';

/**
 * La table lue au téléphone : une colonne à la fois, un groupe choisi, rien
 * que ce qu'il y a à faire. Le cas piège est le produit fait sur DEUX postes :
 * « Tous » et le pied le comptent une fois, chaque poste le compte pour lui.
 */

const GROUP_KEY = 'lfd.prevision.phone.group';

function header(date: string, over: Partial<ForecastHeader> = {}): ForecastHeader {
  return {
    date,
    weekday: 'jeu.',
    dayMonth: date.slice(8),
    offset: 'J+1',
    totalUnits: 0,
    orderCount: 0,
    resupplyUnits: 0,
    plannedUnits: 0,
    closed: false,
    today: false,
    peak: false,
    state: 'open',
    tone: null,
    stateLabel: null,
    ...over,
  };
}

const HEADERS = [header('2026-09-03'), header('2026-09-04')];

function cell(quantity: number, resupply = 0, weighed = false): ForecastCell {
  return {
    quantity,
    label: String(quantity),
    pieces: weighed ? (quantity > 0 ? 1 : 0) : quantity,
    exceptional: false,
    resupply,
  };
}

function product(sku: string, name: string, cells: readonly ForecastCell[]): ForecastProduct {
  return {
    sku,
    productName: name,
    saleUnit: sku === 'PAI-001' ? 'weight' : 'piece',
    cells,
    totalUnits: cells.reduce((sum, one) => sum + one.quantity, 0),
  };
}

const CROISSANT = product('VIE-001', 'Croissant', [cell(100), cell(0)]);

/** Le four et le tour : le croissant passe par les deux (un produit, deux postes). */
const RAYONS: readonly ForecastRayon[] = [
  {
    key: 'ws:four',
    label: 'Four',
    quantities: [100, 60],
    totalUnits: 160,
    lines: [CROISSANT, product('VIE-002', 'Pain au chocolat', [cell(0), cell(60, 20)])],
    intertitles: new Map(),
  },
  {
    key: 'ws:tour',
    label: 'Tour',
    quantities: [101, 0],
    totalUnits: 101,
    lines: [CROISSANT, product('PAI-001', 'Pain de campagne', [cell(1500, 0, true), cell(0)])],
    intertitles: new Map(),
  },
];

function stubPhone(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

function mount(): ComponentFixture<ForecastTable> {
  const fixture = TestBed.createComponent(ForecastTable);
  fixture.componentRef.setInput('columns', dayColumns(HEADERS));
  fixture.componentRef.setInput('footRows', DAY_FOOT_ROWS);
  fixture.componentRef.setInput('rayons', RAYONS);
  fixture.detectChanges();
  return fixture;
}

const all = (fixture: ComponentFixture<ForecastTable>, selector: string): readonly string[] =>
  [...fixture.nativeElement.querySelectorAll(selector)].map(
    (node: Element) => node.textContent?.trim() ?? '',
  );

function listbox(fixture: ComponentFixture<ForecastTable>): FoldListboxComponent<string> {
  return fixture.debugElement.query(By.css('fold-listbox')).injector.get(FoldListboxComponent);
}

function pick(fixture: ComponentFixture<ForecastTable>, key: string): void {
  fixture.debugElement.query(By.css('fold-listbox')).triggerEventHandler('selectionChange', key);
  fixture.detectChanges();
}

function next(fixture: ComponentFixture<ForecastTable>): void {
  fixture.debugElement.query(By.css('[data-phone-next]')).triggerEventHandler('clicked');
  fixture.detectChanges();
}

describe('phoneDayTotals', () => {
  it('compte une fois un produit présent sous deux postes, et un produit au poids pour une pièce', () => {
    expect(phoneDayTotals(RAYONS, 0)).toEqual({ refs: 2, pieces: 101, orders: 101, shops: 0 });
  });

  it('sépare la part des boutiques de celle des commandes', () => {
    expect(phoneDayTotals(RAYONS, 1)).toEqual({ refs: 1, pieces: 60, orders: 40, shops: 20 });
  });
});

describe('rayonsToDo', () => {
  it('retire les lignes à zéro, puis les groupes vides', () => {
    const shown = rayonsToDo(RAYONS, 1);
    expect(shown.map((rayon) => rayon.key)).toEqual(['ws:four']);
    expect(shown[0]?.lines.map((line) => line.sku)).toEqual(['VIE-002']);
  });
});

describe('ForecastTable au téléphone', () => {
  beforeEach(() => {
    localStorage.removeItem(GROUP_KEY);
    stubPhone(true);
  });

  afterEach(() => localStorage.removeItem(GROUP_KEY));

  it('ne montre qu’une colonne, et sans ligne de tête', () => {
    const fixture = mount();

    expect(all(fixture, '[data-phone-nav] .pv-phone-title')).toEqual(['jeu. 03']);
    expect(fixture.nativeElement.querySelector('.pv-row--head')).toBeNull();
    for (const row of fixture.nativeElement.querySelectorAll('.pv-row--line')) {
      expect(row.querySelectorAll('.pv-cell')).toHaveLength(2);
    }
  });

  it('masque les produits à zéro ce jour-là', () => {
    const fixture = mount();

    expect(all(fixture, '.pv-product')).toEqual(['Croissant', 'Croissant', 'Pain de campagne']);
  });

  it('passe au jour suivant, puis rend la main à la page au bord', () => {
    const fixture = mount();
    const beyond: number[] = [];
    const keys: string[] = [];
    fixture.componentInstance.stepBeyond.subscribe((direction) => beyond.push(direction));
    fixture.componentInstance.focusedKey.subscribe((key) => keys.push(key));

    next(fixture);
    expect(all(fixture, '.pv-phone-title')).toEqual(['jeu. 04']);
    expect(keys).toEqual(['2026-09-04']);

    next(fixture);
    expect(beyond).toEqual([1]);
  });

  it('dit les références et les pièces du jour pour chaque poste, « Tous » sans doublon', () => {
    const fixture = mount();

    expect(
      listbox(fixture)
        .options()
        ?.map((option) => 'label' in option && option.label),
    ).toEqual(['Tous — 2 réf. / 101 pcs', 'Four — 1 réf. / 100 pcs', 'Tour — 2 réf. / 101 pcs']);
  });

  it('ne montre que le poste choisi, sans sa ligne de tête, et le pied le suit', () => {
    const fixture = mount();
    expect(all(fixture, '[data-foot="pieces"]')).toEqual(['101']);

    pick(fixture, 'ws:four');

    expect(all(fixture, '.pv-product')).toEqual(['Croissant']);
    expect(fixture.nativeElement.querySelector('.pv-row--rayon')).toBeNull();
    expect(all(fixture, '[data-foot="pieces"]')).toEqual(['100']);
    expect(localStorage.getItem(GROUP_KEY)).toBe('ws:four');
  });

  it('rouvre sur le poste retenu', () => {
    localStorage.setItem(GROUP_KEY, 'ws:tour');
    const fixture = mount();

    expect(listbox(fixture).value()).toBe('ws:tour');
    expect(all(fixture, '.pv-product')).toEqual(['Croissant', 'Pain de campagne']);
  });

  it('ne partage le chiffre en trois que les jours qui ont des réassorts', () => {
    const fixture = mount();
    expect(fixture.nativeElement.querySelector('[data-phone-split-head]')).toBeNull();

    next(fixture);

    expect(fixture.nativeElement.querySelector('[data-phone-split-head]')).not.toBeNull();
    expect(all(fixture, '[data-part="orders"]')).toEqual(['40']);
    expect(all(fixture, '[data-part="shops"]')).toEqual(['20']);
    expect(all(fixture, '[data-foot-part]')).toEqual(['40', '20']);
  });
});

describe('ForecastTable au bureau', () => {
  beforeEach(() => stubPhone(false));

  it('garde toutes les colonnes, les lignes à zéro et le pied du serveur', () => {
    const fixture = mount();

    expect(fixture.nativeElement.querySelector('[data-phone-nav]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.pv-row--head .pv-day')).toHaveLength(2);
    expect(all(fixture, '.pv-product')).toHaveLength(4);
  });
});
