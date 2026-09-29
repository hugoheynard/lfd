import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { DeliveryBagView, DeliveryOrderBagsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DeliveryLoadingService } from '../delivery-loading.service';
import { BagLabelsPage } from './bag-labels-page';

function bagOf(overrides: Partial<DeliveryBagView>): DeliveryBagView {
  return {
    bagId: 'b-1',
    code: 'ABC234',
    orderId: 'o-1',
    reference: 'CMD-1',
    customerLabel: 'Le Comptoir',
    index: 1,
    total: 2,
    voidedAt: null,
    ...overrides,
  };
}

const VIEW: DeliveryOrderBagsView = {
  orderId: 'o-1',
  reference: 'CMD-1',
  bags: [
    bagOf({}),
    bagOf({ bagId: 'b-x', code: 'ABC999', index: null, voidedAt: '2026-10-01T05:00:00.000Z' }),
    bagOf({ bagId: 'b-2', code: 'ABC235', index: 2 }),
  ],
};

let calls: string[];

async function settle(fixture: ComponentFixture<BagLabelsPage>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function boot(): Promise<HTMLElement> {
  calls = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: DeliveryLoadingService,
        useValue: {
          orderBags: (orderId: string) => {
            calls.push(`read ${orderId}`);
            return Promise.resolve(VIEW);
          },
        } satisfies Partial<Record<keyof DeliveryLoadingService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(BagLabelsPage);
  fixture.componentRef.setInput('orderId', 'o-1');
  fixture.detectChanges();
  await settle(fixture);
  return fixture.nativeElement as HTMLElement;
}

describe('BagLabelsPage', () => {
  it('🔴 une LECTURE : imprimer ne déclare rien', async () => {
    await boot();
    expect(calls).toEqual(['read o-1']);
  });

  it('une étiquette par sac vivant — le sac annulé n’en a plus', async () => {
    const element = await boot();
    const labels = [...element.querySelectorAll('[data-bag-label]')];
    expect(labels).toHaveLength(2);
    expect(labels[1]?.textContent).toContain('sac 2 / 2');
    expect(labels.map((label) => label.querySelector('[data-bag-code]')?.textContent)).toEqual([
      'ABC234',
      'ABC235',
    ]);
  });

  it('encode l’adresse absolue du sac dans le QR', async () => {
    const element = await boot();
    const qr = element.querySelector('[data-bag-label] svg');
    expect(qr?.getAttribute('aria-label')).toBe(
      `QR code : ${window.location.origin}/livraison/sac/b-1`,
    );
  });
});
