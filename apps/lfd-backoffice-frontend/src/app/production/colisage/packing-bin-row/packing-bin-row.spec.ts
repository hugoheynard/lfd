import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  BinTypeView,
  DeclareDeliveryBinsPayload,
  DeliveryBinView,
  DeliveryPackingProposalView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryBinsService } from '../../../livraison/delivery-bins.service';
import { DeliveryLoadingService } from '../../../livraison/delivery-loading.service';
import { PackingBinRow } from './packing-bin-row';

/**
 * Ce que ces cas tiennent (lot PC1, `plan-le-plus-choisit-un-bac.md` D2-D3) :
 * un « + » déclare UN bac par la route existante, « − » annule le DERNIER, le
 * compte affiché est la liste servie, le format proposé est en couleur sans
 * rien déclarer, et les avertissements de « Prête » se calculent.
 */

function type(over: Partial<BinTypeView>): BinTypeView {
  return {
    id: 't-m',
    name: 'Bac M',
    outer: { lengthCm: 60, widthCm: 40, heightCm: 22 },
    inner: { lengthCm: 56, widthCm: 36, heightCm: 20 },
    innerVolumeLiters: 40,
    isotherm: false,
    maxStack: 6,
    divisible: false,
    archivedAt: null,
    ...over,
  };
}

function bin(binId: string, over: Partial<DeliveryBinView> = {}): DeliveryBinView {
  return {
    binId,
    code: binId.toUpperCase(),
    orderId: 'o-1',
    reference: 'CMD-1',
    customerLabel: 'Le Refuge',
    index: 1,
    total: 1,
    voidedAt: null,
    binType: { id: 't-m', name: 'Bac M', isotherm: false, archived: false },
    half: null,
    physicalBinId: `p-${binId}`,
    innerBags: 0,
    sharedWith: null,
    toRedo: false,
    ...over,
  };
}

/** La livraison doublée : elle garde ce qu'on lui envoie, et sert la liste qu'on lui donne. */
class FakeDelivery {
  bins: DeliveryBinView[] = [];
  readonly declared: DeclareDeliveryBinsPayload[] = [];
  readonly voided: string[] = [];
  voidRefusal: unknown = null;
  proposal: DeliveryPackingProposalView | null = null;

  declareBins(payload: DeclareDeliveryBinsPayload): Promise<{ binIds: string[] }> {
    this.declared.push(payload);
    const binId = `b-${String(this.bins.length + 1)}`;
    this.bins.push(bin(binId, { half: payload.half ? 'left' : null }));
    return Promise.resolve({ binIds: [binId] });
  }

  voidBin(binId: string): Promise<void> {
    this.voided.push(binId);
    if (this.voidRefusal !== null) {
      return Promise.reject(this.voidRefusal);
    }
    this.bins = this.bins.map((entry) =>
      entry.binId === binId ? { ...entry, voidedAt: '2026-10-01T05:00:00.000Z' } : entry,
    );
    return Promise.resolve();
  }

  orderBins(orderId: string) {
    return Promise.resolve({ orderId, reference: 'CMD-1', bins: [...this.bins], round: null });
  }

  packingProposal(): Promise<DeliveryPackingProposalView> {
    return this.proposal === null
      ? Promise.reject(new Error('sans proposition'))
      : Promise.resolve(this.proposal);
  }
}

let delivery: FakeDelivery;
let allowed: boolean;

const TYPES = [
  type({ id: 't-s', name: 'Bac S', isotherm: true }),
  type({ id: 't-l', name: 'Bac L', divisible: true }),
];

async function settle(fixture: ComponentFixture<PackingBinRow>): Promise<void> {
  for (let tick = 0; tick < 3; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }
}

async function render(): Promise<{ fixture: ComponentFixture<PackingBinRow>; el: HTMLElement }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PermissionsStore, useValue: { can: () => allowed } },
      { provide: DeliveryLoadingService, useValue: delivery },
      {
        provide: DeliveryBinsService,
        useValue: { binTypes: () => Promise.resolve({ types: TYPES }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PackingBinRow);
  fixture.componentRef.setInput('orderId', 'o-1');
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

function said(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

function formats(el: HTMLElement): HTMLButtonElement[] {
  return [...el.querySelectorAll<HTMLButtonElement>('[data-bin-format]')];
}

describe('la rangée « + format » (lot PC1)', () => {
  beforeEach(() => {
    delivery = new FakeDelivery();
    allowed = true;
  });

  it('un bouton par type en service, « ½ » pour le cloisonnable', async () => {
    const { el } = await render();

    expect(formats(el).map((button) => said(button))).toEqual([
      '+ Bac S ❄',
      '+ Bac L',
      '+ ½ Bac L',
    ]);
    expect(said(el.querySelector('[data-bin-row-count]'))).toBe('aucun bac');
  });

  it('🔴 « + Bac L » déclare UN bac par la route existante, et le compte est la liste servie', async () => {
    const { fixture, el } = await render();

    formats(el)[1]?.click();
    await settle(fixture);
    formats(el)[2]?.click();
    await settle(fixture);

    expect(delivery.declared).toEqual([
      { orderId: 'o-1', binTypeId: 't-l', whole: 1, half: false, innerBags: 0 },
      { orderId: 'o-1', binTypeId: 't-l', whole: 0, half: true, innerBags: 0 },
    ]);
    expect(said(el.querySelector('[data-bin-row-count]'))).toBe('2 bacs');
    expect(el.querySelectorAll('[data-bin-row-bin]')).toHaveLength(2);
  });

  it('🔴 « − » annule le DERNIER bac, et lui seul porte le bouton', async () => {
    delivery.bins = [bin('b-1'), bin('b-2')];
    const { fixture, el } = await render();

    expect(el.querySelectorAll('[data-bin-row-remove]')).toHaveLength(1);
    el.querySelector<HTMLButtonElement>('[data-bin-row-remove]')?.click();
    await settle(fixture);

    expect(delivery.voided).toEqual(['b-2']);
    expect(said(el.querySelector('[data-bin-row-count]'))).toBe('1 bac');
  });

  it('un bac chargé : le refus du serveur se dit tel quel, et la liste reste celle servie', async () => {
    delivery.bins = [bin('b-1')];
    delivery.voidRefusal = new HttpErrorResponse({
      status: 409,
      error: { message: 'Ce bac est chargé : déchargez-le d’abord.' },
    });
    const { fixture, el } = await render();

    el.querySelector<HTMLButtonElement>('[data-bin-row-remove]')?.click();
    await settle(fixture);

    expect(said(el.querySelector('[data-bin-row-refusal]'))).toContain('déchargez-le');
    expect(said(el.querySelector('[data-bin-row-count]'))).toBe('1 bac');
  });

  it('🔴 met le format proposé en couleur (Q2) — et ne déclare rien d’office', async () => {
    delivery.proposal = {
      orderId: 'o-1',
      reference: 'CMD-1',
      lines: [],
      bins: [
        {
          binTypeId: 't-s',
          binTypeName: 'Bac S',
          isotherm: true,
          cold: true,
          whole: 1,
          half: false,
          fill: 0.5,
          content: [],
        },
      ],
      unplaced: [],
      shareCandidate: null,
    };
    const { el } = await render();

    expect(formats(el).map((button) => button.getAttribute('data-proposed'))).toEqual([
      'true',
      null,
      null,
    ]);
    expect(delivery.declared).toEqual([]);
  });

  it('expose les avertissements de « Prête » : aucun bac, puis du froid sans isotherme', async () => {
    delivery.proposal = {
      orderId: 'o-1',
      reference: 'CMD-1',
      lines: [{ sku: 'TAR', name: 'Tarte', quantity: 2, requiresCold: true }],
      bins: [],
      unplaced: [],
      shareCandidate: null,
    };
    const { fixture, el } = await render();
    expect(fixture.componentInstance.warnings()).toEqual([
      'Aucun bac déclaré pour cette livraison.',
    ]);

    formats(el)[1]?.click();
    await settle(fixture);

    expect(fixture.componentInstance.warnings()).toEqual([
      'La commande contient du froid, aucun bac isotherme.',
    ]);
  });

  it('sans le droit, une phrase et aucune lecture', async () => {
    allowed = false;
    const { el } = await render();

    expect(el.querySelector('[data-bin-row-counter]')).not.toBeNull();
    expect(formats(el)).toHaveLength(0);
  });
});
