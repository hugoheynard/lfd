import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import type { DeclareDeliveryBagsPayload, StaffPermission } from '@lfd/contracts';
import { FoldNumberInputComponent } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryLoadingService } from '../../../livraison/delivery-loading.service';
import { declarableCount, PackingBags } from './packing-bags';

let calls: string[];
let refuse: HttpErrorResponse | null;

async function settle(fixture: ComponentFixture<PackingBags>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function boot(
  grants: readonly StaffPermission[],
): Promise<{ fixture: ComponentFixture<PackingBags>; element: HTMLElement }> {
  calls = [];
  refuse = null;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: DeliveryLoadingService,
        useValue: {
          declareBags: (payload: DeclareDeliveryBagsPayload) => {
            calls.push(`declare ${JSON.stringify(payload)}`);
            return refuse === null ? Promise.resolve() : Promise.reject(refuse);
          },
        } satisfies Partial<Record<keyof DeliveryLoadingService, unknown>>,
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => grants.includes(permission) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PackingBags);
  fixture.componentRef.setInput('orderId', 'o-1');
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('PackingBags', () => {
  it('🔴 sans `delivery_loading:write`, pas de bouton : les sacs se déclarent au comptoir', async () => {
    const { element } = await boot(['b2b_orders:write']);
    expect(element.querySelector('[data-bags-toggle]')).toBeNull();
    expect(element.querySelector('[data-bags-counter]')?.textContent).toContain('au comptoir');
  });

  it('déclare un sac par défaut, puis ouvre les étiquettes', async () => {
    const { fixture, element } = await boot(['delivery_loading:write']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    element.querySelector<HTMLButtonElement>('button[data-bags-toggle]')?.click();
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('button[data-bags-declare]')?.click();
    await settle(fixture);
    expect(calls).toEqual(['declare {"orderId":"o-1","count":1}']);
    expect(navigate).toHaveBeenCalledWith(['/livraison/etiquettes', 'o-1']);
  });

  it('déclare le nombre choisi, et garde le refus sur place', async () => {
    const { fixture, element } = await boot(['delivery_loading:write']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    element.querySelector<HTMLButtonElement>('button[data-bags-toggle]')?.click();
    fixture.detectChanges();
    fixture.debugElement
      .query(By.directive(FoldNumberInputComponent))
      .triggerEventHandler('valueChange', 3);
    fixture.detectChanges();
    refuse = new HttpErrorResponse({ status: 409, error: { message: 'Commande annulée.' } });
    element.querySelector<HTMLButtonElement>('button[data-bags-declare]')?.click();
    await settle(fixture);
    expect(calls).toEqual(['declare {"orderId":"o-1","count":3}']);
    expect(navigate).not.toHaveBeenCalled();
    expect(element.querySelector('[data-bags-refusal]')?.textContent?.trim()).toBe(
      'Commande annulée.',
    );
  });
});

describe('declarableCount', () => {
  it('ne rend qu’un entier entre 1 et 20', () => {
    expect(declarableCount(1)).toBe(1);
    expect(declarableCount(20)).toBe(20);
    expect(declarableCount(0)).toBeNull();
    expect(declarableCount(21)).toBeNull();
    expect(declarableCount(2.5)).toBeNull();
    expect(declarableCount(null)).toBeNull();
  });
});
