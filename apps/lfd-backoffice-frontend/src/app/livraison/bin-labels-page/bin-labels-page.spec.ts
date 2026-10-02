import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { DeliveryBinView, DeliveryOrderBinsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DeliveryLoadingService } from '../delivery-loading.service';
import { BinLabelsPage } from './bin-labels-page';

function binOf(overrides: Partial<DeliveryBinView>): DeliveryBinView {
  return {
    binId: 'b-1',
    code: 'ABC234',
    orderId: 'o-1',
    reference: 'CMD-1',
    customerLabel: 'Le Comptoir',
    index: 1,
    total: 2,
    voidedAt: null,
    binType: { id: 't-m', name: 'Bac M', isotherm: false, archived: false },
    half: null,
    physicalBinId: null,
    innerBags: 0,
    sharedWith: null,
    toRedo: false,
    ...overrides,
  };
}

const VIEW: DeliveryOrderBinsView = {
  orderId: 'o-1',
  reference: 'CMD-1',
  bins: [
    binOf({}),
    binOf({ binId: 'b-x', code: 'ABC999', index: null, voidedAt: '2026-10-01T05:00:00.000Z' }),
    binOf({
      binId: 'b-2',
      code: 'ABC235',
      index: 2,
      binType: { id: 't-l', name: 'Bac L', isotherm: false, archived: true },
      half: 'left',
      physicalBinId: 'p-1',
      innerBags: 2,
      sharedWith: { binId: 'b-9', orderId: 'o-9', reference: 'CMD-9', customerLabel: 'Le Refuge' },
    }),
  ],
  round: {
    roundId: 'r-1',
    day: '2026-10-01',
    vehicleName: 'Kangoo',
    passage: 2,
    position: 3,
    departedAt: null,
  },
};

let served: DeliveryOrderBinsView = VIEW;

let calls: string[];

async function settle(fixture: ComponentFixture<BinLabelsPage>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function boot(bacs?: string, view: DeliveryOrderBinsView = VIEW): Promise<HTMLElement> {
  calls = [];
  served = view;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: DeliveryLoadingService,
        useValue: {
          orderBins: (orderId: string) => {
            calls.push(`read ${orderId}`);
            return Promise.resolve(served);
          },
        } satisfies Partial<Record<keyof DeliveryLoadingService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(BinLabelsPage);
  fixture.componentRef.setInput('orderId', 'o-1');
  if (bacs !== undefined) {
    fixture.componentRef.setInput('bacs', bacs);
  }
  fixture.detectChanges();
  await settle(fixture);
  return fixture.nativeElement as HTMLElement;
}

describe('BinLabelsPage', () => {
  it('n’imprime que les bacs tout juste déclarés, et dit que les autres existent', async () => {
    const element = await boot('b-2');
    expect(element.querySelectorAll('app-bin-label')).toHaveLength(1);
    expect(element.querySelector('[data-labels-selection]')?.textContent).toContain('1 sur');
    expect(element.querySelector('[data-labels-all]')).not.toBeNull();
  });

  it('sans sélection, toutes les étiquettes, sans rappel', async () => {
    const element = await boot();
    expect(element.querySelectorAll('app-bin-label')).toHaveLength(2);
    expect(element.querySelector('[data-labels-selection]')).toBeNull();
  });

  it('🔴 une LECTURE : imprimer ne déclare rien', async () => {
    await boot();
    expect(calls).toEqual(['read o-1']);
  });

  it('une étiquette par bac vivant — le bac annulé n’en a plus', async () => {
    const element = await boot();
    const labels = [...element.querySelectorAll('[data-bin-label]')];
    expect(labels).toHaveLength(2);
    expect(labels[1]?.textContent).toContain('bac 2 / 2');
    expect(labels.map((label) => label.querySelector('[data-bin-code]')?.textContent)).toEqual([
      'ABC234',
      'ABC235',
    ]);
  });

  it('encode l’adresse absolue du bac dans le QR', async () => {
    const element = await boot();
    const qr = element.querySelector('[data-bin-label] svg');
    expect(qr?.getAttribute('aria-label')).toBe(
      `QR code : ${window.location.origin}/livraison/bac/b-1`,
    );
  });

  it('dit le type, la moitié, le partage et les sacs dedans — un type archivé reste lisible', async () => {
    const element = await boot();
    const [whole, half] = [...element.querySelectorAll('[data-bin-label]')];
    expect(whole?.querySelector('[data-bin-kind]')?.textContent?.trim()).toBe('Bac M');
    expect(whole?.querySelector('[data-bin-shared]')).toBeNull();
    expect(whole?.querySelector('[data-bin-inner]')).toBeNull();
    expect(half?.querySelector('[data-bin-kind]')?.textContent?.trim()).toBe('Bac L · ½ gauche');
    expect(half?.querySelector('[data-bin-shared]')?.textContent?.trim()).toBe(
      'partagé avec CMD-9 · Le Refuge',
    );
    expect(half?.querySelector('[data-bin-inner]')?.textContent?.trim()).toBe('2 sacs dedans');
  });

  /** Lot PC3 : on pose le bac dans la zone de sa tournée, au rang de son arrêt. */
  it('imprime en gros la tournée et le rang d’arrêt sur chaque étiquette', async () => {
    const element = await boot();
    const labels = [...element.querySelectorAll('[data-bin-label]')];
    expect(
      labels.map((label) => label.querySelector('[data-bin-round]')?.textContent?.trim()),
    ).toEqual(['Kangoo · passage 2', 'Kangoo · passage 2']);
    expect(labels[0]?.querySelector('[data-bin-stop]')?.textContent?.trim()).toBe('Arrêt 3');
  });

  it('hors tournée, n’imprime ni tournée ni rang — on n’invente pas', async () => {
    const element = await boot(undefined, { ...VIEW, round: null });
    expect(element.querySelector('[data-bin-round]')).toBeNull();
    expect(element.querySelector('[data-bin-stop]')).toBeNull();
  });
});
