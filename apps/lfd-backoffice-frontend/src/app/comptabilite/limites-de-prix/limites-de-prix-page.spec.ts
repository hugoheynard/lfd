import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type {
  FloorClientele,
  PriceFloorView,
  PriceLimitsView,
  PricingBoardView,
  PricingItemView,
  StaffPermission,
} from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { TarificationService } from '../../b2b/tarification/tarification.service';
import { PriceLimitsService } from '../price-limits.service';
import { BulkFloorPanel, type BulkFloorPanelData } from './bulk-floor-panel/bulk-floor-panel';
import { FloorPanel, type FloorPanelData } from './floor-panel/floor-panel';
import { LimitesDePrixPage } from './limites-de-prix-page';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build ne disent :
 *
 * - tous les articles sont listés, avec deux pastilles écrites : « Sans limite »
 *   et « Limite du catalogue seulement », et leur compteur en tête ;
 * - le filtre « Sans limite » / « À couvrir » ;
 * - une ligne ouvre le panneau de SA portée ; « Créer une limite » l'ouvre vide ;
 * - la pose groupée part avec la sélection ;
 * - sans `lfc_price_limits:write`, ni création ni sélection, et un panneau en lecture ;
 * - la clientèle choisie part avec la lecture, la bannière n'est que sous Public.
 */

function floor(over: Partial<PriceFloorView> = {}): PriceFloorView {
  return {
    id: 'global',
    scope: { type: 'global', id: null },
    mode: 'percent',
    value: 5000,
    dynamic: null,
    drift: null,
    createdBy: 'staff',
    createdByName: null,
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

function item(sku: string, name: string): PricingItemView {
  return {
    sku,
    name,
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
  };
}

function shelf(id: string, name: string, items: PricingItemView[]) {
  return {
    id,
    name,
    vatRatePercent: 5.5,
    floor: null,
    rules: [],
    overlaps: [],
    ladders: [],
    items,
  };
}

/** Viennoiseries : couvertes par leur famille. Pains : rien de plus que le catalogue. */
const BOARD: PricingBoardView = {
  categories: [
    shelf('vie', 'Viennoiseries', [item('VIE-001', 'Croissant')]),
    shelf('pain', 'Pains', [item('PAI-001', 'Baguette'), item('PAI-002', 'Fougasse')]),
  ],
  globalFloor: null,
  globalRules: [],
  canonicalHistoryStartsAt: null,
  simulation: { quantity: 1, at: '2026-08-17T10:00:00.000Z', audience: 'all' },
};

const FAMILY = floor({ id: 'category:vie', scope: { type: 'category', id: 'vie' }, value: 6000 });

class FakeLimits {
  readonly listed: FloorClientele[] = [];
  /** Pro : famille des viennoiseries + catalogue. Public : rien. */
  list(clientele: FloorClientele): Promise<PriceLimitsView> {
    this.listed.push(clientele);
    return Promise.resolve({ clientele, floors: clientele === 'pro' ? [FAMILY, floor()] : [] });
  }
}

interface Opened {
  readonly component: unknown;
  readonly data: unknown;
}

async function render(
  limits: FakeLimits,
  permissions: readonly StaffPermission[],
  opened: Opened[] = [],
): Promise<ComponentFixture<LimitesDePrixPage>> {
  TestBed.configureTestingModule({
    imports: [LimitesDePrixPage],
    providers: [
      { provide: PriceLimitsService, useValue: limits },
      { provide: TarificationService, useValue: { read: () => Promise.resolve(BOARD) } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (component: unknown, config: { data: unknown }) => {
            opened.push({ component, data: config.data });
            return { closed: Promise.resolve(false) };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(LimitesDePrixPage);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<LimitesDePrixPage>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

const text = (fixture: ComponentFixture<LimitesDePrixPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function buttons(fixture: ComponentFixture<LimitesDePrixPage>): string[] {
  const all = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('button');
  return Array.from(all).map((b) => b.textContent?.replace(/\s+/g, ' ').trim() ?? '');
}

const READ: StaffPermission[] = ['lfc_price_limits:read'];
const WRITE: StaffPermission[] = ['lfc_price_limits:read', 'lfc_price_limits:write'];
const BANNER = "Les limites publiques s'appliqueront";

describe('LimitesDePrixPage — couverture', () => {
  it('liste tous les articles, avec leur provenance', async () => {
    const fixture = await render(new FakeLimits(), READ);

    expect(text(fixture)).toContain('Croissant');
    expect(text(fixture)).toContain('Baguette');
    expect(text(fixture)).toContain('héritée de la famille');
    expect(text(fixture)).toContain('héritée du catalogue');
  });

  it('écrit « catalogue seulement » et le compte en tête', async () => {
    const fixture = await render(new FakeLimits(), READ);

    expect(text(fixture)).toContain('Limite du catalogue seulement');
    expect(text(fixture)).toContain('0 sans limite');
    expect(text(fixture)).toContain('2 au catalogue seulement');
  });

  it('écrit « Sans limite » quand rien ne s’applique (Public ici)', async () => {
    const fixture = await render(new FakeLimits(), READ);
    fixture.componentInstance['setClientele']('public');
    await settle(fixture);

    expect(text(fixture)).toContain('Sans limite');
    expect(text(fixture)).toContain('3 sans limite');
  });

  it('filtre « À couvrir » : les rayons couverts disparaissent', async () => {
    const fixture = await render(new FakeLimits(), READ);
    fixture.componentInstance['setFilter']('to-cover');
    fixture.detectChanges();

    const shelves = fixture.componentInstance['visibleShelves']();
    expect(shelves.map((s) => s.family.name)).toEqual(['Pains']);
  });

  it('filtre « Sans limite » : rien quand le catalogue couvre tout', async () => {
    const fixture = await render(new FakeLimits(), READ);
    fixture.componentInstance['setFilter']('none');
    fixture.detectChanges();

    expect(fixture.componentInstance['visibleShelves']()).toEqual([]);
    expect(text(fixture)).toContain('Tout est couvert');
  });
});

describe('LimitesDePrixPage — ouverture par portée', () => {
  it('ouvre le panneau de l’article, avec ce dont il hérite', async () => {
    const opened: Opened[] = [];
    const fixture = await render(new FakeLimits(), WRITE, opened);
    const row = fixture.componentInstance['coverage']()?.shelves[0]?.articles[0];

    if (row !== undefined) {
      fixture.componentInstance['open'](row);
    }

    expect(opened[0]?.component).toBe(FloorPanel);
    const data = opened[0]?.data as FloorPanelData;
    expect(data.target?.scope).toEqual({ type: 'product', id: 'VIE-001' });
    expect(data.target?.current).toBeNull();
    expect(data.target?.inherited?.id).toBe(FAMILY.id);
    expect(data.canWrite).toBe(true);
  });

  it('ouvre le panneau de la famille et du catalogue', async () => {
    const opened: Opened[] = [];
    const fixture = await render(new FakeLimits(), WRITE, opened);
    const [catalogue, family] = fixture.componentInstance['scopeRows']();

    if (catalogue !== undefined && family !== undefined) {
      fixture.componentInstance['open'](catalogue);
      fixture.componentInstance['open'](family);
    }

    const scopes = opened.map((o) => (o.data as FloorPanelData).target?.scope);
    expect(scopes).toEqual([
      { type: 'global', id: null },
      { type: 'category', id: 'vie' },
    ]);
  });

  it('« Créer une limite » ouvre le panneau vide, avec les portées à choisir', async () => {
    const opened: Opened[] = [];
    const fixture = await render(new FakeLimits(), WRITE, opened);

    fixture.componentInstance['create']();

    const data = opened[0]?.data as FloorPanelData;
    expect(data.target).toBeNull();
    expect(data.choices.map((c) => c.group)).toEqual([
      'catalogue',
      'family',
      'family',
      'article',
      'article',
      'article',
    ]);
  });
});

describe('LimitesDePrixPage — droit', () => {
  it('sans le droit : ni création, ni sélection, et un panneau en lecture', async () => {
    const opened: Opened[] = [];
    const fixture = await render(new FakeLimits(), READ, opened);

    expect(buttons(fixture)).not.toContain('Créer une limite');
    expect(buttons(fixture).some((b) => b.startsWith('Poser une limite'))).toBe(false);
    const row = fixture.componentInstance['scopeRows']()[0];
    if (row !== undefined) {
      fixture.componentInstance['open'](row);
    }
    expect((opened[0]?.data as FloorPanelData).canWrite).toBe(false);
  });

  it('avec le droit : création et pose groupée', async () => {
    const fixture = await render(new FakeLimits(), WRITE);

    expect(buttons(fixture)).toContain('Créer une limite');
    expect(buttons(fixture)).toContain('Poser une limite sur 0 articles');
  });
});

describe('LimitesDePrixPage — pose groupée', () => {
  it('ouvre le panneau groupé sur tout ce qui est filtré', async () => {
    const opened: Opened[] = [];
    const fixture = await render(new FakeLimits(), WRITE, opened);
    fixture.componentInstance['setFilter']('to-cover');
    fixture.componentInstance['selectFiltered']();
    fixture.detectChanges();

    await fixture.componentInstance['openBulk']();

    expect(opened[0]?.component).toBe(BulkFloorPanel);
    const data = opened[0]?.data as BulkFloorPanelData;
    expect(data.clientele).toBe('pro');
    expect(data.articles.map((a) => a.sku)).toEqual(['PAI-001', 'PAI-002']);
  });
});

describe('LimitesDePrixPage — clientèle', () => {
  it('ne dit la bannière que sous Public, et relit pour le public', async () => {
    const limits = new FakeLimits();
    const fixture = await render(limits, READ);
    expect(text(fixture)).not.toContain(BANNER);

    fixture.componentInstance['setClientele']('public');
    await settle(fixture);

    expect(text(fixture)).toContain(BANNER);
    expect(limits.listed).toEqual(['pro', 'public']);
  });
});
