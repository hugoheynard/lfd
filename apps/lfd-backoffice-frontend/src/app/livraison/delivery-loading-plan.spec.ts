import type {
  DeliveryLoadingPlanBinView,
  DeliveryLoadingPlanStepView,
  DeliveryLoadingPlanVolumeView,
  DeliveryLoadingRoundView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  currentStep,
  loadedBinKeys,
  planBinLabel,
  stackStopsLabel,
  stackTitle,
  stepContentLabel,
  stepHeadline,
  UNKNOWN_DRY_CAPACITY,
  volumeGauges,
} from './delivery-loading-plan';

function bin(overrides: Partial<DeliveryLoadingPlanBinView> = {}): DeliveryLoadingPlanBinView {
  return {
    binId: 'b-1',
    code: 'ABC234',
    reference: 'CMD-6',
    binTypeName: 'Bac M',
    half: null,
    sharedWithReference: null,
    isotherm: false,
    stackIndex: 1,
    ...overrides,
  };
}

function step(n: number, bins: readonly DeliveryLoadingPlanBinView[]): DeliveryLoadingPlanStepView {
  return {
    step: n,
    stopPosition: 7 - n,
    reference: `CMD-${String(7 - n)}`,
    customerLabel: 'Les Balcons de la Daille',
    bins,
  };
}

function loaded(...pairs: readonly (readonly [string, 'left' | 'right' | null])[]) {
  const round: Pick<DeliveryLoadingRoundView, 'stops'> = {
    stops: [
      {
        stopId: 's',
        orderId: 'o',
        reference: 'CMD-6',
        customerLabel: 'x',
        position: 6,
        state: 'partial',
        bins: pairs.map(([binId, half], i) => ({
          binId,
          code: 'C',
          index: i + 1,
          binTypeName: 'Bac M',
          half,
          innerBags: 0,
          sharedWithReference: null,
          toRedo: false,
          loadedAt: '2026-10-01T05:00:00.000Z',
        })),
      },
    ],
  };
  return loadedBinKeys(round);
}

const VOLUME: DeliveryLoadingPlanVolumeView = {
  dryLiters: 120,
  coldLiters: 40,
  dryCapacityLiters: 800,
  coldCapacityLiters: 42,
  dryOver: false,
  coldOver: false,
};

describe('le plan de chargement, dit à l’écran', () => {
  it('titre la première étape « Charger d’abord » et groupe les bacs par nature', () => {
    const s = step(1, [bin(), bin({ binId: 'b-2' })]);
    expect(stepHeadline(s, 3)).toBe(
      '1. Charger d’abord — arrêt 6 · CMD-6 · Les Balcons de la Daille : 2 × Bac M',
    );
    expect(stepHeadline(step(3, []), 3)).toContain('3. En dernier');
    expect(stepHeadline(step(2, []), 3)).toContain('2. Puis');
    expect(stepContentLabel([])).toBe('aucun bac');
    expect(stepContentLabel([bin(), bin({ binTypeName: 'Bac S', half: 'left' })])).toBe(
      '1 × Bac M, 1 × Bac S ½ gauche',
    );
  });

  it('dit d’un bac son code, sa moitié, son partage, le froid et sa pile', () => {
    expect(
      planBinLabel(
        bin({ half: 'right', sharedWithReference: 'CMD-5', isotherm: true, stackIndex: 2 }),
      ),
    ).toBe('ABC234 · Bac M · ½ droite · CMD-6, partagé avec CMD-5 · ❄ isotherme · pile 2');
    expect(planBinLabel(bin())).toBe('ABC234 · Bac M · pile 1');
  });

  it('coche les moitiés séparément : charger la gauche ne coche pas la droite', () => {
    const keys = loaded(['b-1', 'left']);
    const order = [step(1, [bin({ half: 'left' }), bin({ half: 'right', reference: 'CMD-5' })])];
    expect(currentStep(order, keys)).toBe(1);
    expect(currentStep(order, loaded(['b-1', 'left'], ['b-1', 'right']))).toBeNull();
  });

  it('met en avant la première étape non entièrement chargée, en sautant les étapes vides', () => {
    const order = [step(1, [bin()]), step(2, []), step(3, [bin({ binId: 'b-3' })])];
    expect(currentStep(order, loaded())).toBe(1);
    expect(currentStep(order, loaded(['b-1', null]))).toBe(3);
    expect(currentStep(order, loaded(['b-1', null], ['b-3', null]))).toBeNull();
  });

  it('décrit une pile : type, hauteur sur maximum, arrêts de bas en haut', () => {
    const stack = {
      stackIndex: 1,
      binTypeName: 'Bac M',
      binTypeHeightCm: 22,
      height: 3,
      maxStack: 5,
      stopPositions: [6, 5],
      placement: null,
    };
    expect(stackTitle(stack)).toBe('Pile 1 · Bac M — 3 / 5');
    expect(stackStopsLabel(stack)).toBe('de bas en haut : arrêt 6, arrêt 5');
  });

  it('rend deux jauges, et passe en avertissement près du plein, en alerte au-delà', () => {
    const [dry, cold] = volumeGauges(VOLUME);
    expect(dry).toMatchObject({ label: 'Sec', tone: 'success', detail: '120 L / 800 L' });
    expect(cold).toMatchObject({ label: 'Froid', tone: 'warning' });
    expect(volumeGauges({ ...VOLUME, dryLiters: 900, dryOver: true })[0]?.tone).toBe('alert');
  });

  it('ne dit jamais « ça tient » quand la capacité est inconnue', () => {
    const [dry] = volumeGauges({ ...VOLUME, dryCapacityLiters: null });
    expect(dry?.capacityLiters).toBeNull();
    expect(dry?.detail).toBe(`120 L — ${UNKNOWN_DRY_CAPACITY}`);
  });
});
