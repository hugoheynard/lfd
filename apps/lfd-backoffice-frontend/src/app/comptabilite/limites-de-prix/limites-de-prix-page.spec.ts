import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type {
  FloorClientele,
  PriceFloorView,
  PriceLimitsView,
  PricingBoardView,
  StaffPermission,
} from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { TarificationService } from '../../b2b/tarification/tarification.service';
import { PriceLimitsService } from '../price-limits.service';
import { FloorPanel, type FloorPanelData } from './floor-panel/floor-panel';
import { LimitesDePrixPage } from './limites-de-prix-page';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build ne disent :
 *
 * - la liste se lit global, puis familles, puis articles — l'ordre de l'héritage ;
 * - sans `lfc_price_limits:write`, aucun geste ne s'affiche ;
 * - la bannière n'apparaît que sous Public ;
 * - la clientèle choisie part avec la lecture ET avec le geste — sans elle, le
 *   serveur viserait la limite pro.
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

const ITEM_FLOOR = floor({
  id: 'product:VIE-001',
  scope: { type: 'product', id: 'VIE-001' },
  mode: 'amount',
  value: 150_000,
});
const CATEGORY_FLOOR = floor({
  id: 'category:vie',
  scope: { type: 'category', id: 'vie' },
  value: 6000,
});

const BOARD: PricingBoardView = {
  categories: [
    {
      id: 'vie',
      name: 'Viennoiseries',
      vatRatePercent: 5.5,
      floor: null,
      rules: [],
      overlaps: [],
      ladders: [],
      items: [
        {
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
        },
      ],
    },
  ],
  globalFloor: null,
  globalRules: [],
  canonicalHistoryStartsAt: null,
  simulation: { quantity: 1, at: '2026-08-17T10:00:00.000Z', audience: 'all' },
};

class FakeLimits {
  readonly listed: FloorClientele[] = [];
  readonly confirmed: FloorClientele[] = [];

  list(clientele: FloorClientele): Promise<PriceLimitsView> {
    this.listed.push(clientele);
    // Rendu dans le désordre : l'écran trie, pas le serveur.
    return Promise.resolve({ clientele, floors: [ITEM_FLOOR, floor(), CATEGORY_FLOOR] });
  }

  confirmFloor(_scope: unknown, clientele: FloorClientele): Promise<void> {
    this.confirmed.push(clientele);
    return Promise.resolve();
  }
}

async function render(
  limits: FakeLimits,
  permissions: readonly StaffPermission[],
  opened: { component: unknown; data: unknown }[] = [],
): Promise<ComponentFixture<LimitesDePrixPage>> {
  TestBed.configureTestingModule({
    imports: [LimitesDePrixPage],
    providers: [
      { provide: PriceLimitsService, useValue: limits },
      {
        provide: TarificationService,
        useValue: { read: () => Promise.resolve(BOARD) },
      },
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
  return Array.from(all).map((b) => b.textContent?.trim() ?? '');
}

const BANNER = "Les limites publiques s'appliqueront";

describe('LimitesDePrixPage', () => {
  it('lit global, puis familles, puis articles, nommés par le tableau', async () => {
    const fixture = await render(new FakeLimits(), ['lfc_price_limits:read']);
    const page = fixture.componentInstance;

    expect(page['sorted']().map((f) => f.scope.type)).toEqual(['global', 'category', 'product']);
    expect(text(fixture)).toContain('Viennoiseries');
    expect(text(fixture)).toContain('Croissant');
  });

  it('ne montre aucun geste sans `lfc_price_limits:write`', async () => {
    const fixture = await render(new FakeLimits(), ['lfc_price_limits:read']);

    expect(buttons(fixture)).not.toContain('Poser une limite');
    expect(buttons(fixture)).not.toContain('Modifier');
    expect(buttons(fixture)).not.toContain('Retirer');
  });

  it('montre les gestes avec `lfc_price_limits:write`', async () => {
    const fixture = await render(new FakeLimits(), [
      'lfc_price_limits:read',
      'lfc_price_limits:write',
    ]);

    expect(buttons(fixture)).toContain('Poser une limite');
    expect(buttons(fixture)).toContain('Modifier');
    expect(buttons(fixture)).toContain('Retirer');
  });

  it('ne dit la bannière que sous Public, et relit pour le public', async () => {
    const limits = new FakeLimits();
    const fixture = await render(limits, ['lfc_price_limits:read']);
    expect(text(fixture)).not.toContain(BANNER);

    fixture.componentInstance['setClientele']('public');
    await settle(fixture);

    expect(text(fixture)).toContain(BANNER);
    expect(limits.listed).toEqual(['pro', 'public']);
  });

  it('ouvre le dialogue de limite avec la clientèle choisie', async () => {
    const opened: { component: unknown; data: unknown }[] = [];
    const fixture = await render(
      new FakeLimits(),
      ['lfc_price_limits:read', 'lfc_price_limits:write'],
      opened,
    );
    fixture.componentInstance['setClientele']('public');
    await settle(fixture);

    fixture.componentInstance['edit'](ITEM_FLOOR);

    expect(opened[0]?.component).toBe(FloorPanel);
    const data = opened[0]?.data as FloorPanelData;
    expect(data.clientele).toBe('public');
    expect(data.target).toBe('Croissant');
    expect(data.current?.id).toBe(ITEM_FLOOR.id);
    expect(data.canonicalMillicents).toBe(200_000);
  });

  it('confirme pour la clientèle choisie', async () => {
    const limits = new FakeLimits();
    const fixture = await render(limits, ['lfc_price_limits:read', 'lfc_price_limits:write']);
    fixture.componentInstance['setClientele']('public');
    await settle(fixture);

    await fixture.componentInstance['confirm'](ITEM_FLOOR);

    expect(limits.confirmed).toEqual(['public']);
  });
});
