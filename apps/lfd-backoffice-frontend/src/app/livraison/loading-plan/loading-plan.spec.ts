import { TestBed } from '@angular/core/testing';
import type { DeliveryLoadingPlanView, DeliveryLoadingRoundView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

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
          behind: false,
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
          behind: false,
          stackIndex: 2,
        },
      ],
    },
  ],
  stacks: [
    {
      stackIndex: 1,
      binTypeName: 'Bac M',
      binTypeHeightCm: 22,
      height: 1,
      maxStack: 5,
      stopPositions: [6],
      placement: null,
    },
    {
      stackIndex: 2,
      binTypeName: 'Bac iso',
      binTypeHeightCm: 22,
      height: 1,
      maxStack: 4,
      stopPositions: [5],
      placement: null,
    },
  ],
  floor: null,
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

function render(plan: DeliveryLoadingPlanView): HTMLElement {
  const fixture = TestBed.createComponent(LoadingPlan);
  fixture.componentRef.setInput('plan', plan);
  fixture.componentRef.setInput('round', ROUND);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('LoadingPlan', () => {
  it('coche le bac scanné et met en avant la première étape pas entièrement chargée', () => {
    const element = render(PLAN);
    const steps = [...element.querySelectorAll('[data-plan-step]')];
    expect(steps).toHaveLength(2);
    expect(steps[0]?.hasAttribute('data-current')).toBe(false);
    expect(steps[0]?.querySelector('[data-plan-bin-loaded]')).not.toBeNull();
    expect(steps[1]?.hasAttribute('data-current')).toBe(true);
    expect(steps[1]?.textContent).toContain('❄ isotherme');
    expect(element.textContent).toContain('SUGGÉRÉ');
  });

  it('dit la capacité sèche inconnue en phrase, sans jauge, et le froid en jauge', () => {
    const element = render(PLAN);
    expect(element.querySelector('[data-volume-unknown]')?.textContent).toContain(
      'capacité inconnue — renseignez les dimensions du véhicule',
    );
    expect(element.querySelectorAll('[data-volume-gauge]')).toHaveLength(1);
  });

  it('liste les piles, sans répéter les alertes que l’écran porte déjà', () => {
    const element = render(PLAN);
    expect(element.querySelector('[data-plan-warning]')).toBeNull();
    expect(element.querySelectorAll('[data-plan-stack]')).toHaveLength(2);
  });

  it('sans dimensions, dit qu’il n’y a pas de plancher et garde les piles', () => {
    const element = render(PLAN);
    expect(element.querySelector('[data-plan-floor]')).toBeNull();
    expect(element.querySelector('[data-plan-floor-unknown]')?.textContent).toContain(
      'Les dimensions de Kangoo ne sont pas renseignées',
    );
    expect(element.querySelectorAll('[data-plan-stack]')).toHaveLength(2);
  });

  it('dessine le plancher vu de dessus quand le serveur le rend (G5)', () => {
    const measured: DeliveryLoadingPlanView = {
      ...PLAN,
      floor: { lengthCm: 200, widthCm: 120, wheelArches: null },
      stacks: PLAN.stacks.map((stack, index) => ({
        ...stack,
        placement:
          index === 0
            ? {
                kind: 'floor',
                row: 1,
                xCm: 0,
                yCm: 0,
                depthCm: 60,
                widthCm: 40,
                orientation: 'length',
              }
            : { kind: 'refrigerated' },
      })),
    };
    const element = render(measured);
    expect(element.querySelector('[data-plan-floor-unknown]')).toBeNull();
    expect(element.querySelectorAll('[data-floor-stack]')).toHaveLength(1);
    expect(element.querySelector('[data-floor-cold]')?.textContent).toContain('pile 2 (arrêt 5)');
  });
});
