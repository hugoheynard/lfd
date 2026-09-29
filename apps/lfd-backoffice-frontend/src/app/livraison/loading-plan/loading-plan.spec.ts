import { TestBed } from '@angular/core/testing';
import type { DeliveryLoadingPlanView, DeliveryLoadingRoundView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DeliveryLoadingService } from '../delivery-loading.service';
import { LoadingPlan } from './loading-plan';

const ROUND: DeliveryLoadingRoundView = {
  roundId: 'r-1',
  day: '2026-10-01',
  vehicleName: 'Kangoo',
  passage: 1,
  version: 3,
  departedAt: null,
  stops: [
    {
      stopId: 's-6',
      orderId: 'o-6',
      reference: 'CMD-6',
      customerLabel: 'Les Balcons',
      position: 6,
      state: 'loaded',
      bins: [
        {
          binId: 'b-1',
          code: 'AAA111',
          index: 1,
          binTypeName: 'Bac M',
          half: null,
          innerBags: 0,
          sharedWithReference: null,
          toRedo: false,
          loadedAt: '2026-10-01T05:00:00.000Z',
        },
      ],
    },
  ],
};

const PLAN: DeliveryLoadingPlanView = {
  roundId: 'r-1',
  vehicleName: 'Kangoo',
  order: [
    {
      step: 1,
      stopPosition: 6,
      reference: 'CMD-6',
      customerLabel: 'Les Balcons',
      bins: [
        {
          binId: 'b-1',
          code: 'AAA111',
          reference: 'CMD-6',
          binTypeName: 'Bac M',
          half: null,
          sharedWithReference: null,
          isotherm: false,
          stackIndex: 1,
        },
      ],
    },
    {
      step: 2,
      stopPosition: 5,
      reference: 'CMD-5',
      customerLabel: 'Le Refuge',
      bins: [
        {
          binId: 'b-2',
          code: 'BBB222',
          reference: 'CMD-5',
          binTypeName: 'Bac iso',
          half: null,
          sharedWithReference: null,
          isotherm: true,
          stackIndex: 2,
        },
      ],
    },
  ],
  stacks: [
    { stackIndex: 1, binTypeName: 'Bac M', height: 1, maxStack: 5, stopPositions: [6] },
    { stackIndex: 2, binTypeName: 'Bac iso', height: 1, maxStack: 4, stopPositions: [5] },
  ],
  volume: {
    dryLiters: 60,
    coldLiters: 30,
    dryCapacityLiters: null,
    coldCapacityLiters: 200,
    dryOver: false,
    coldOver: false,
  },
  warnings: [{ kind: 'unknown_cargo', message: 'Le volume utile de Kangoo est inconnu.' }],
};

async function boot(plan: () => Promise<DeliveryLoadingPlanView>): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: DeliveryLoadingService,
        useValue: { plan } satisfies Partial<Record<keyof DeliveryLoadingService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(LoadingPlan);
  fixture.componentRef.setInput('round', ROUND);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('LoadingPlan', () => {
  it('coche le bac scanné et met en avant la première étape pas entièrement chargée', async () => {
    const element = await boot(() => Promise.resolve(PLAN));
    const steps = [...element.querySelectorAll('[data-plan-step]')];
    expect(steps).toHaveLength(2);
    expect(steps[0]?.hasAttribute('data-current')).toBe(false);
    expect(steps[0]?.querySelector('[data-plan-bin-loaded]')).not.toBeNull();
    expect(steps[1]?.hasAttribute('data-current')).toBe(true);
    expect(steps[1]?.textContent).toContain('❄ isotherme');
    expect(element.textContent).toContain('SUGGÉRÉ');
  });

  it('dit la capacité sèche inconnue en phrase, sans jauge, et le froid en jauge', async () => {
    const element = await boot(() => Promise.resolve(PLAN));
    expect(element.querySelector('[data-volume-unknown]')?.textContent).toContain(
      'capacité inconnue — renseignez les dimensions du véhicule',
    );
    expect(element.querySelectorAll('[data-volume-gauge]')).toHaveLength(1);
  });

  it('affiche les alertes du serveur telles quelles, et les piles', async () => {
    const element = await boot(() => Promise.resolve(PLAN));
    expect(element.querySelector('[data-plan-warning]')?.textContent?.trim()).toBe(
      'Le volume utile de Kangoo est inconnu.',
    );
    expect(element.querySelectorAll('[data-plan-stack]')).toHaveLength(2);
  });

  it('dit un plan illisible par l’état d’erreur fold', async () => {
    const element = await boot(() => Promise.reject(new Error('500')));
    expect(element.querySelector('[data-plan-error]')).not.toBeNull();
  });
});
