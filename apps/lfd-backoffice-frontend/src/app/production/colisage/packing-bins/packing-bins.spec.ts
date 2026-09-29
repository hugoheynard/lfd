import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import type {
  BinTypeView,
  DeclareDeliveryBinsPayload,
  DeliveryLoadingDayView,
  DeliveryLoadingRoundView,
  ShareDeliveryBinPayload,
  StaffPermission,
} from '@lfd/contracts';
import { FoldCheckboxComponent, FoldListboxComponent, FoldNumberInputComponent } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryBinsService } from '../../../livraison/delivery-bins.service';
import { DeliveryLoadingService } from '../../../livraison/delivery-loading.service';
import { declarablePayload, PackingBins } from './packing-bins';

function type(overrides: Partial<BinTypeView>): BinTypeView {
  const dimensions = { lengthCm: 60, widthCm: 40, heightCm: 30 };
  return {
    id: 't-m',
    name: 'Bac M',
    outer: dimensions,
    inner: dimensions,
    innerVolumeLiters: 72,
    isotherm: false,
    maxStack: 5,
    divisible: true,
    archivedAt: null,
    ...overrides,
  };
}

const TYPES = [
  type({}),
  type({ id: 't-s', name: 'Bac S isotherme', isotherm: true, divisible: false }),
  type({ id: 't-old', name: 'Bac ancien', archivedAt: '2026-09-01T00:00:00.000Z' }),
];

const DAY: DeliveryLoadingDayView = {
  day: '2026-10-01',
  rounds: [
    {
      roundId: 'r-gone',
      vehicleName: 'Master',
      passage: 1,
      departedAt: '2026-10-01T05:00:00.000Z',
      stops: 2,
      loadedStops: 2,
      stopsWithBinToRedo: 0,
    },
    {
      roundId: 'r-1',
      vehicleName: 'Kangoo',
      passage: 1,
      departedAt: null,
      stops: 2,
      loadedStops: 0,
      stopsWithBinToRedo: 0,
    },
  ],
};

const ROUND: DeliveryLoadingRoundView = {
  roundId: 'r-1',
  day: '2026-10-01',
  vehicleName: 'Kangoo',
  passage: 1,
  version: 3,
  departedAt: null,
  stops: [
    {
      stopId: 's-1',
      orderId: 'o-2',
      reference: 'CMD-2',
      customerLabel: 'Le Refuge',
      position: 1,
      state: 'partial',
      bins: [
        {
          binId: 'h-2',
          code: 'ABC234',
          index: 1,
          binTypeName: 'Bac M',
          half: 'left',
          innerBags: 1,
          sharedWithReference: null,
          toRedo: false,
          loadedAt: null,
        },
      ],
    },
    {
      stopId: 's-2',
      orderId: 'o-1',
      reference: 'CMD-1',
      customerLabel: 'Le Comptoir',
      position: 2,
      state: 'unlabelled',
      bins: [],
    },
  ],
};

let calls: string[];
let refuse: HttpErrorResponse | null;

async function settle(fixture: ComponentFixture<PackingBins>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function boot(
  grants: readonly StaffPermission[],
): Promise<{ fixture: ComponentFixture<PackingBins>; element: HTMLElement }> {
  calls = [];
  refuse = null;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: DeliveryLoadingService,
        useValue: {
          declareBins: (payload: DeclareDeliveryBinsPayload) => {
            calls.push(`declare ${JSON.stringify(payload)}`);
            return refuse === null ? Promise.resolve() : Promise.reject(refuse);
          },
          shareBin: (payload: ShareDeliveryBinPayload) => {
            calls.push(`share ${JSON.stringify(payload)}`);
            return Promise.resolve();
          },
          day: (day: string) => {
            calls.push(`day ${day}`);
            return Promise.resolve(DAY);
          },
          round: (roundId: string) => {
            calls.push(`round ${roundId}`);
            return Promise.resolve(ROUND);
          },
        } satisfies Partial<Record<keyof DeliveryLoadingService, unknown>>,
      },
      {
        provide: DeliveryBinsService,
        useValue: {
          binTypes: () => Promise.resolve({ types: TYPES }),
        } satisfies Partial<Record<keyof DeliveryBinsService, unknown>>,
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => grants.includes(permission) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PackingBins);
  fixture.componentRef.setInput('orderId', 'o-1');
  fixture.componentRef.setInput('day', '2026-10-01');
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

async function openForm(
  fixture: ComponentFixture<PackingBins>,
  element: HTMLElement,
): Promise<void> {
  element.querySelector<HTMLButtonElement>('button[data-bins-toggle]')?.click();
  await settle(fixture);
}

function listbox(fixture: ComponentFixture<PackingBins>, index: number) {
  return fixture.debugElement.queryAll(By.directive(FoldListboxComponent))[index];
}

describe('PackingBins', () => {
  it('🔴 sans `delivery_loading:write`, pas de bouton : les bacs se déclarent au comptoir', async () => {
    const { element } = await boot(['b2b_orders:write']);
    expect(element.querySelector('[data-bins-toggle]')).toBeNull();
    expect(element.querySelector('[data-bins-counter]')?.textContent).toContain('au comptoir');
  });

  it('ne propose que les types non archivés (v2-7)', async () => {
    const { fixture, element } = await boot(['delivery_loading:write']);
    await openForm(fixture, element);
    const options = listbox(fixture, 0)?.componentInstance as FoldListboxComponent<string>;
    expect(options.options()?.map((option) => ('label' in option ? option.label : ''))).toEqual([
      'Bac M',
      'Bac S isotherme',
    ]);
  });

  it('déclare un type, des entiers, une moitié et des sacs, puis ouvre les étiquettes', async () => {
    const { fixture, element } = await boot(['delivery_loading:write']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await openForm(fixture, element);
    listbox(fixture, 0)?.triggerEventHandler('valueChange', 't-m');
    fixture.detectChanges();
    const numbers = fixture.debugElement.queryAll(By.directive(FoldNumberInputComponent));
    numbers[0]?.triggerEventHandler('valueChange', 2);
    numbers[1]?.triggerEventHandler('valueChange', 3);
    fixture.debugElement
      .query(By.directive(FoldCheckboxComponent))
      .triggerEventHandler('checkedChange', true);
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('button[data-bins-declare]')?.click();
    await settle(fixture);
    expect(calls).toEqual([
      'declare {"orderId":"o-1","binTypeId":"t-m","whole":2,"half":true,"innerBags":3}',
    ]);
    expect(navigate).toHaveBeenCalledWith(['/livraison/etiquettes', 'o-1']);
  });

  it('pas de moitié sur un type qui n’est pas cloisonnable', async () => {
    const { fixture, element } = await boot(['delivery_loading:write']);
    await openForm(fixture, element);
    listbox(fixture, 0)?.triggerEventHandler('valueChange', 't-s');
    fixture.detectChanges();
    expect(element.querySelector('[data-bins-half]')).toBeNull();
  });

  it('garde le refus sur place', async () => {
    const { fixture, element } = await boot(['delivery_loading:write']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await openForm(fixture, element);
    listbox(fixture, 0)?.triggerEventHandler('valueChange', 't-m');
    fixture.detectChanges();
    refuse = new HttpErrorResponse({ status: 409, error: { message: 'Commande annulée.' } });
    element.querySelector<HTMLButtonElement>('button[data-bins-declare]')?.click();
    await settle(fixture);
    expect(navigate).not.toHaveBeenCalled();
    expect(element.querySelector('[data-bins-refusal]')?.textContent?.trim()).toBe(
      'Commande annulée.',
    );
  });

  it('partage une moitié libre de l’arrêt voisin, cherchée dans la tournée vivante du jour', async () => {
    const { fixture, element } = await boot(['delivery_loading:write']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await openForm(fixture, element);
    element.querySelector<HTMLButtonElement>('button[data-bins-share-open]')?.click();
    await settle(fixture);
    // La tournée partie n'est pas relue : elle ne reçoit plus de partage.
    expect(calls).toEqual(['day 2026-10-01', 'round r-1']);
    const partner = listbox(fixture, 1)?.componentInstance as FoldListboxComponent<string>;
    expect(partner.options()?.map((option) => ('label' in option ? option.label : ''))).toEqual([
      'CMD-2 · Le Refuge — Bac M · ½ gauche · 1 sac dedans (arrêt 1)',
    ]);
    listbox(fixture, 1)?.triggerEventHandler('valueChange', 'h-2');
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('button[data-bins-share]')?.click();
    await settle(fixture);
    expect(calls.at(-1)).toBe('share {"orderId":"o-1","partnerBinId":"h-2","innerBags":0}');
    expect(navigate).toHaveBeenCalledWith(['/livraison/etiquettes', 'o-1']);
  });
});

describe('declarablePayload', () => {
  const draft = { binTypeId: 't-m', whole: 1, half: false, innerBags: 0 } as const;
  const divisible = { divisible: true };

  it('rend la déclaration complète', () => {
    expect(declarablePayload('o-1', draft, divisible)).toEqual({ orderId: 'o-1', ...draft });
  });

  it('refuse sans type, hors borne, ou sans aucun bac', () => {
    expect(declarablePayload('o-1', { ...draft, binTypeId: null }, null)).toBeNull();
    expect(declarablePayload('o-1', { ...draft, whole: 21 }, divisible)).toBeNull();
    expect(declarablePayload('o-1', { ...draft, whole: 1.5 }, divisible)).toBeNull();
    expect(declarablePayload('o-1', { ...draft, innerBags: 51 }, divisible)).toBeNull();
    expect(declarablePayload('o-1', { ...draft, whole: 0 }, divisible)).toBeNull();
  });

  it('une moitié seule suffit, sur un type cloisonnable seulement', () => {
    expect(declarablePayload('o-1', { ...draft, whole: 0, half: true }, divisible)?.half).toBe(
      true,
    );
    expect(
      declarablePayload('o-1', { ...draft, whole: 0, half: true }, { divisible: false }),
    ).toBeNull();
  });
});
