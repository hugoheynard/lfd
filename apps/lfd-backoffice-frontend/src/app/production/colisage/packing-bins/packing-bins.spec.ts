import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import type {
  BinTypeView,
  DeclareDeliveryBinsPayload,
  DeliveryBinFreeHalvesView,
  DeliveryBinView,
  DeliveryPackingProposalView,
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

const HALVES: DeliveryBinFreeHalvesView = {
  orderId: 'o-1',
  reference: 'CMD-1',
  round: {
    roundId: 'r-1',
    day: '2026-10-01',
    vehicleName: 'Kangoo',
    passage: 1,
    position: 2,
    departedAt: null,
  },
  halves: [
    {
      binId: 'h-2',
      code: 'ABC234',
      orderId: 'o-2',
      reference: 'CMD-2',
      customerLabel: 'Le Refuge',
      position: 1,
      binTypeId: 't-m',
      binTypeName: 'Bac M',
      isotherm: false,
      freeHalf: 'right',
    },
  ],
};

const PROPOSAL: DeliveryPackingProposalView = {
  orderId: 'o-1',
  reference: 'CMD-1',
  lines: [
    { sku: 'CRO', name: 'Croissant', quantity: 30, requiresCold: false },
    { sku: 'FLAN', name: 'Flan', quantity: 2, requiresCold: true },
    { sku: 'NEW', name: 'Kouign-amann', quantity: 4, requiresCold: false },
  ],
  bins: [
    {
      binTypeId: 't-s',
      binTypeName: 'Bac S isotherme',
      isotherm: true,
      cold: true,
      whole: 1,
      half: false,
      fill: 0.4,
      content: [{ sku: 'FLAN', quantity: 2 }],
    },
    {
      binTypeId: 't-m',
      binTypeName: 'Bac M',
      isotherm: false,
      cold: false,
      whole: 2,
      half: false,
      fill: 0.25,
      content: [{ sku: 'CRO', quantity: 30 }],
    },
  ],
  unplaced: [{ sku: 'NEW', name: 'Kouign-amann', quantity: 4, reason: 'no_capacity' }],
  shareCandidate: {
    partnerOrderId: 'o-2',
    partnerReference: 'CMD-2',
    partnerBinId: 'h-2',
    binTypeId: 't-m',
    binTypeName: 'Bac M',
    replacesBinIndex: 1,
  },
};

let calls: string[];
let refuse: HttpErrorResponse | null;
let declaredCount: number;

async function settle(fixture: ComponentFixture<PackingBins>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function boot(
  grants: readonly StaffPermission[],
  proposal: DeliveryPackingProposalView = PROPOSAL,
  existing: readonly DeliveryBinView[] = [],
): Promise<{ fixture: ComponentFixture<PackingBins>; element: HTMLElement }> {
  calls = [];
  refuse = null;
  declaredCount = 0;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: DeliveryLoadingService,
        useValue: {
          declareBins: (payload: DeclareDeliveryBinsPayload) => {
            calls.push(`declare ${JSON.stringify(payload)}`);
            declaredCount += 1;
            return refuse === null
              ? Promise.resolve({ binIds: [`b-${String(declaredCount)}`] })
              : Promise.reject(refuse);
          },
          shareBin: (payload: ShareDeliveryBinPayload) => {
            calls.push(`share ${JSON.stringify(payload)}`);
            return Promise.resolve({ binId: 'b-shared' });
          },
          packingProposal: () => Promise.resolve(proposal),
          freeHalves: () => Promise.resolve(HALVES),
          orderBins: () => Promise.resolve({ orderId: 'o-1', reference: 'CMD-1', bins: existing }),
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

/** Ouvre le panneau, puis la saisie libre (« Autre colisage »). */
async function openManual(
  fixture: ComponentFixture<PackingBins>,
  element: HTMLElement,
): Promise<void> {
  await openForm(fixture, element);
  element.querySelector<HTMLButtonElement>('button[data-bins-manual]')?.click();
  await settle(fixture);
}

function said(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/gu, ' ').trim();
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
    await openManual(fixture, element);
    const options = listbox(fixture, 0)?.componentInstance as FoldListboxComponent<string>;
    expect(options.options()?.map((option) => ('label' in option ? option.label : ''))).toEqual([
      'Bac M',
      'Bac S isotherme',
    ]);
  });

  it('déclare un type, des entiers, une moitié et des sacs, puis ouvre les étiquettes', async () => {
    const { fixture, element } = await boot(['delivery_loading:write']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await openManual(fixture, element);
    listbox(fixture, 0)?.triggerEventHandler('valueChange', 't-m');
    fixture.detectChanges();
    const numbers = fixture.debugElement.queryAll(By.directive(FoldNumberInputComponent));
    // [0] : les sacs, saisis une fois en tête ; [1] : les bacs entiers.
    numbers[1]?.triggerEventHandler('valueChange', 2);
    numbers[0]?.triggerEventHandler('valueChange', 3);
    fixture.debugElement
      .query(By.directive(FoldCheckboxComponent))
      .triggerEventHandler('checkedChange', true);
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('button[data-bins-declare]')?.click();
    await settle(fixture);
    expect(calls).toEqual([
      'declare {"orderId":"o-1","binTypeId":"t-m","whole":2,"half":true,"innerBags":3}',
    ]);
    expect(navigate).toHaveBeenCalledWith(['/livraison/etiquettes', 'o-1'], {
      queryParams: { bacs: 'b-1' },
    });
  });

  it('pas de moitié sur un type qui n’est pas cloisonnable', async () => {
    const { fixture, element } = await boot(['delivery_loading:write']);
    await openManual(fixture, element);
    listbox(fixture, 0)?.triggerEventHandler('valueChange', 't-s');
    fixture.detectChanges();
    expect(element.querySelector('[data-bins-half]')).toBeNull();
  });

  it('garde le refus sur place', async () => {
    const { fixture, element } = await boot(['delivery_loading:write']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await openManual(fixture, element);
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

  it('partage une moitié libre lue par `partenaires` — plus aucune relecture de tournée', async () => {
    const { fixture, element } = await boot(['delivery_loading:write']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await openManual(fixture, element);
    element.querySelector<HTMLButtonElement>('button[data-bins-share-open]')?.click();
    await settle(fixture);
    const partner = listbox(fixture, 1)?.componentInstance as FoldListboxComponent<string>;
    expect(partner.options()?.map((option) => ('label' in option ? option.label : ''))).toEqual([
      'CMD-2 · Le Refuge — ½ Bac M, côté droit libre (arrêt 1)',
    ]);
    listbox(fixture, 1)?.triggerEventHandler('valueChange', 'h-2');
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('button[data-bins-share]')?.click();
    await settle(fixture);
    expect(calls).toEqual(['share {"orderId":"o-1","partnerBinId":"h-2","innerBags":0}']);
    expect(navigate).toHaveBeenCalledWith(['/livraison/etiquettes', 'o-1'], {
      queryParams: { bacs: 'b-shared' },
    });
  });

  it('montre la proposition : résumé, contenu, remplissage, non-placés', async () => {
    const { fixture, element } = await boot(['delivery_loading:write']);
    await openForm(fixture, element);
    expect(said(element.querySelector('[data-proposal-summary]'))).toContain(
      'Proposé : 2 × Bac M (❄ 1 × Bac S isotherme)',
    );
    expect(said(element.querySelector('[data-proposal]'))).toContain('30 × Croissant');
    expect(said(element.querySelector('[data-proposal-unplaced]'))).toContain(
      '4 × Kouign-amann — sans contenance',
    );
    // Sans le droit des réglages, pas de lien vers les contenances.
    expect(element.querySelector('[data-proposal-capacities]')).toBeNull();
    // La saisie libre reste derrière « Autre colisage ».
    expect(element.querySelector('[data-bins-type]')).toBeNull();
  });

  it('offre le lien des contenances à qui peut les écrire', async () => {
    const { fixture, element } = await boot(['delivery_loading:write', 'delivery_settings:write']);
    await openForm(fixture, element);
    expect(element.querySelector('[data-proposal-capacities]')).not.toBeNull();
  });

  it('« Déclarer comme proposé » : une déclaration par entrée, puis les seules étiquettes créées', async () => {
    const { fixture, element } = await boot(['delivery_loading:write']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await openForm(fixture, element);
    element.querySelector<HTMLButtonElement>('button[data-proposal-declare]')?.click();
    await settle(fixture);
    expect(calls).toEqual([
      'declare {"orderId":"o-1","binTypeId":"t-s","whole":1,"half":false,"innerBags":0}',
      'declare {"orderId":"o-1","binTypeId":"t-m","whole":2,"half":false,"innerBags":0}',
    ]);
    expect(navigate).toHaveBeenCalledWith(['/livraison/etiquettes', 'o-1'], {
      queryParams: { bacs: 'b-1,b-2' },
    });
  });

  /** Régression : un second clic doublait les bacs déjà déclarés (relevé au bâti, 2026-09-29). */
  it('« Déclarer comme proposé » est fermé quand des bacs sont déjà déclarés', async () => {
    const bin: DeliveryBinView = {
      binId: 'b-0',
      code: 'ABC123',
      orderId: 'o-1',
      reference: 'CMD-1',
      customerLabel: 'Le Chalet',
      index: 1,
      total: 1,
      voidedAt: null,
      binType: { id: 't-m', name: 'Bac M', isotherm: false, archived: false },
      half: null,
      physicalBinId: null,
      innerBags: 0,
      sharedWith: null,
      toRedo: false,
    };
    const { fixture, element } = await boot(['delivery_loading:write'], PROPOSAL, [bin]);
    await openForm(fixture, element);
    expect(
      element.querySelector<HTMLButtonElement>('button[data-proposal-declare]')?.disabled,
    ).toBe(true);
    expect(element.querySelector('[data-proposal-already]')).not.toBeNull();
  });

  it('dernier recours : déclare la proposition moins le bac remplacé, puis partage', async () => {
    const { fixture, element } = await boot(['delivery_loading:write']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await openForm(fixture, element);
    expect(said(element.querySelector('[data-proposal]'))).toContain(
      'En dernier recours : partager ½ Bac M avec Le Refuge, arrêt 1 — économise un bac',
    );
    element.querySelector<HTMLButtonElement>('button[data-proposal-share]')?.click();
    await settle(fixture);
    expect(calls).toEqual([
      'declare {"orderId":"o-1","binTypeId":"t-s","whole":1,"half":false,"innerBags":0}',
      'declare {"orderId":"o-1","binTypeId":"t-m","whole":1,"half":false,"innerBags":0}',
      'share {"orderId":"o-1","partnerBinId":"h-2","innerBags":0}',
    ]);
    expect(navigate).toHaveBeenCalledWith(['/livraison/etiquettes', 'o-1'], {
      queryParams: { bacs: 'b-1,b-2,b-shared' },
    });
  });

  it('sans rien à proposer, la saisie libre s’ouvre d’elle-même', async () => {
    const { fixture, element } = await boot(['delivery_loading:write'], {
      ...PROPOSAL,
      bins: [],
      shareCandidate: null,
    });
    await openForm(fixture, element);
    expect(said(element.querySelector('[data-proposal-summary]'))).toContain('Aucun bac proposé');
    expect(element.querySelector('[data-bins-type]')).not.toBeNull();
    expect(element.querySelector('[data-proposal-share]')).toBeNull();
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
