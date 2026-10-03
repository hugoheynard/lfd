import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  DeliveryLoadingBinView,
  DeliveryLoadingPlanView,
  DeliveryLoadingRoundView,
  LoadDeliveryBinPayload,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { BinScanner } from '../bin-scanner/bin-scanner';
import { LoadingGateway } from '../loading-gateway';
import { type LoadingDeparture, LoadingRound } from './loading-round';

const VIEW: DeliveryLoadingRoundView = {
  roundId: 'r-1',
  day: '2026-10-01',
  vehicleName: 'Kangoo',
  passage: 1,
  version: 7,
  departedAt: null,
  stops: [],
};

async function boot(inputs: {
  readonly canWrite: boolean;
  readonly departure: LoadingDeparture | null;
  readonly view?: DeliveryLoadingRoundView;
}): Promise<{ fixture: ComponentFixture<LoadingRound>; element: HTMLElement; read: string[] }> {
  const read: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: LoadingGateway,
        useValue: {
          round: (roundId: string) => {
            read.push(roundId);
            return Promise.resolve(inputs.view ?? VIEW);
          },
          plan: () => Promise.reject(new Error('plan hors sujet ici')),
          load: () => Promise.resolve(),
          unload: () => Promise.resolve(),
        } satisfies Record<keyof LoadingGateway, unknown>,
      },
    ],
  });
  const fixture = TestBed.createComponent(LoadingRound);
  fixture.componentRef.setInput('roundId', 'r-1');
  fixture.componentRef.setInput('canWrite', inputs.canWrite);
  fixture.componentRef.setInput('departure', inputs.departure);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, read };
}

describe('LoadingRound — paramétré par son hôte', () => {
  it('lit par la porte fournie, et rend la vue lue à l’hôte', async () => {
    const seen: DeliveryLoadingRoundView[] = [];
    const { fixture, read } = await boot({ canWrite: false, departure: null });
    fixture.componentInstance.viewChange.subscribe((view) => seen.push(view));
    expect(read).toEqual(['r-1']);
    fixture.componentRef.setInput('roundId', 'r-2');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    expect(read).toEqual(['r-1', 'r-2']);
    expect(seen).toHaveLength(1);
  });

  it('« Partir » n’existe que si l’hôte l’offre, avec la version lue', async () => {
    const without = await boot({ canWrite: true, departure: null });
    expect(without.element.querySelector('[data-depart]')).toBeNull();

    const calls: string[] = [];
    const { fixture, element } = await boot({
      canWrite: true,
      departure: (roundId, version) => {
        calls.push(`${roundId}@${String(version)}`);
        return Promise.resolve();
      },
    });
    element.querySelector<HTMLButtonElement>('button[data-depart]')?.click();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(calls).toEqual(['r-1@7']);
  });

  it('une tournée partie ne se charge plus, même avec le droit', async () => {
    const { element } = await boot({
      canWrite: true,
      departure: () => Promise.resolve(),
      view: { ...VIEW, departedAt: '2026-10-01T05:42:00.000Z' },
    });
    expect(element.querySelector('[data-departed]')).not.toBeNull();
    expect(element.querySelector('[data-scan]')).toBeNull();
    expect(element.querySelector('[data-depart]')).toBeNull();
  });
});

function planBin(binId: string, code: string, reference: string, stackIndex: number) {
  return {
    binId,
    code,
    reference,
    binTypeName: 'Bac M',
    half: null,
    sharedWithReference: null,
    isotherm: false,
    stackIndex,
  };
}

function floorStack(stackIndex: number, row: number, stopPositions: readonly number[]) {
  return {
    stackIndex,
    binTypeName: 'Bac M',
    binTypeHeightCm: 22,
    height: stopPositions.length,
    maxStack: 5,
    stopPositions,
    placement: {
      kind: 'floor' as const,
      row,
      xCm: (row - 1) * 60,
      yCm: 0,
      depthCm: 60,
      widthCm: 40,
      orientation: 'length' as const,
    },
  };
}

// Rangée 1 (le fond) : AAA222 puis CCC222, arrêt 2. Rangée 2 : BBB222, arrêt 1.
const PLAN: DeliveryLoadingPlanView = {
  roundId: 'r-1',
  vehicleName: 'Kangoo',
  order: [
    {
      step: 1,
      stopPosition: 2,
      reference: 'CMD-2',
      customerLabel: 'Chalet',
      bins: [planBin('b-a', 'AAA222', 'CMD-2', 1), planBin('b-c', 'CCC222', 'CMD-2', 1)],
    },
    {
      step: 2,
      stopPosition: 1,
      reference: 'CMD-1',
      customerLabel: 'Bistrot',
      bins: [planBin('b-b', 'BBB222', 'CMD-1', 2)],
    },
  ],
  stacks: [floorStack(1, 1, [2]), floorStack(2, 2, [1])],
  floor: { lengthCm: 200, widthCm: 120, wheelArches: null },
  volume: {
    dryLiters: 60,
    coldLiters: 0,
    dryCapacityLiters: 800,
    coldCapacityLiters: null,
    dryOver: false,
    coldOver: false,
  },
  warnings: [{ kind: 'floor_over', message: 'La pile 6 ne tient pas au sol : passez au Master.' }],
};

function loadingBin(binId: string, code: string, index: number): DeliveryLoadingBinView {
  return {
    binId,
    code,
    index,
    binTypeName: 'Bac M',
    half: null,
    innerBags: 0,
    sharedWithReference: null,
    toRedo: false,
    loadedAt: null,
  };
}

interface PlanWire {
  view: DeliveryLoadingRoundView;
  readonly loads: string[];
  refuse: HttpErrorResponse | null;
}

async function bootPlanned(): Promise<{
  fixture: ComponentFixture<LoadingRound>;
  element: HTMLElement;
  wire: PlanWire;
}> {
  const wire: PlanWire = {
    view: {
      ...VIEW,
      stops: [
        {
          stopId: 's-2',
          orderId: 'o-2',
          reference: 'CMD-2',
          customerLabel: 'Chalet',
          position: 2,
          state: 'partial',
          bins: [loadingBin('b-a', 'AAA222', 1), loadingBin('b-c', 'CCC222', 2)],
        },
        {
          stopId: 's-1',
          orderId: 'o-1',
          reference: 'CMD-1',
          customerLabel: 'Bistrot',
          position: 1,
          state: 'partial',
          bins: [loadingBin('b-b', 'BBB222', 1)],
        },
      ],
    },
    loads: [],
    refuse: null,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: LoadingGateway,
        useValue: {
          round: () => Promise.resolve(wire.view),
          plan: () => Promise.resolve(PLAN),
          load: (_roundId: string, payload: LoadDeliveryBinPayload) => {
            const code = 'code' in payload ? payload.code : payload.binId;
            wire.loads.push(code);
            if (wire.refuse !== null) {
              return Promise.reject(wire.refuse);
            }
            wire.view = {
              ...wire.view,
              stops: wire.view.stops.map((stop) => ({
                ...stop,
                bins: stop.bins.map((bin) =>
                  bin.code === code ? { ...bin, loadedAt: '2026-10-01T05:00:00.000Z' } : bin,
                ),
              })),
            };
            return Promise.resolve();
          },
          unload: () => Promise.resolve(),
        } satisfies Record<keyof LoadingGateway, unknown>,
      },
    ],
  });
  const fixture = TestBed.createComponent(LoadingRound);
  fixture.componentRef.setInput('roundId', 'r-1');
  fixture.componentRef.setInput('canWrite', true);
  fixture.detectChanges();
  await settle(fixture);
  await settle(fixture);
  return { fixture, element: fixture.nativeElement as HTMLElement, wire };
}

async function settle(fixture: ComponentFixture<LoadingRound>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function scan(fixture: ComponentFixture<LoadingRound>, raw: string): Promise<void> {
  fixture.debugElement.query(By.directive(BinScanner)).triggerEventHandler('scanned', raw);
  await settle(fixture);
  await settle(fixture);
}

function text(element: HTMLElement, selector: string): string {
  return element.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('LoadingRound — le plan de chargement à l’écran', () => {
  it('montre le prochain bac, sa consigne, sa rangée, et les alertes du plan telles quelles', async () => {
    const { element } = await bootPlanned();
    expect(text(element, '[data-next-code]')).toBe('AAA222');
    expect(text(element, '[data-next-placement] strong')).toBe('Rangée 1 (le fond) · pile 1');
    expect(text(element, '[data-next-placement] span')).toBe('à gauche, en bas');
    expect(text(element, '[data-row-view] fold-element-title')).toContain('Rangée 1 · le fond');
    expect(text(element, '[data-plan-warning]')).toBe(
      'La pile 6 ne tient pas au sol : passez au Master.',
    );
  });

  it('🔴 un scan hors rangée CHARGE, puis dit où va le bac et offre d’aller voir', async () => {
    const { fixture, element, wire } = await bootPlanned();
    await scan(fixture, 'BBB222');
    expect(wire.loads).toEqual(['BBB222']);
    expect(text(element, '[data-notice]')).toContain('BBB222 chargé · arrêt 1');
    expect(text(element, '[data-notice-text]')).toBe(
      'Le bac BBB222 va rangée 2, pile 2 — pas dans cette rangée.',
    );
    expect(text(element, '[data-row-view] fold-element-title')).toContain('Rangée 1');

    element.querySelector<HTMLButtonElement>('[data-show-row]')?.click();
    fixture.detectChanges();
    expect(text(element, '[data-row-view] fold-element-title')).toContain('Rangée 2 · les portes');
  });

  it('un code inconnu affiche la phrase du serveur, mot pour mot', async () => {
    const { fixture, element, wire } = await bootPlanned();
    wire.refuse = new HttpErrorResponse({
      status: 404,
      error: { message: 'Aucun bac ZZZ999 dans cette tournée.' },
    });
    await scan(fixture, 'ZZZ999');
    expect(text(element, '[data-notice]')).toContain('Refusé');
    expect(text(element, '[data-notice-text]')).toBe('Aucun bac ZZZ999 dans cette tournée.');
  });

  it('un bac déjà chargé avertit sans rien envoyer', async () => {
    const { fixture, element, wire } = await bootPlanned();
    await scan(fixture, 'AAA222');
    await scan(fixture, 'AAA222');
    expect(wire.loads).toEqual(['AAA222']);
    expect(text(element, '[data-notice]')).toContain('AAA222 est déjà chargé');
  });

  it('toucher une tuile change la carte ; le scan suivant reprend l’ordre', async () => {
    const { fixture, element } = await bootPlanned();
    const tile = [...element.querySelectorAll<HTMLButtonElement>('[data-row-tile]')].find(
      (button) => button.textContent?.includes('CCC222'),
    );
    tile?.click();
    fixture.detectChanges();
    expect(text(element, '[data-next-code]')).toBe('CCC222');

    await scan(fixture, 'CCC222');
    expect(text(element, '[data-notice-text]')).toBe('Suivant : AAA222.');
    expect(text(element, '[data-next-code]')).toBe('AAA222');
  });

  it('toucher un onglet change la rangée ; un scan dans l’ordre la ré-aligne', async () => {
    const { fixture, element } = await bootPlanned();
    element.querySelector<HTMLButtonElement>('[data-row-tab][data-row="2"]')?.click();
    fixture.detectChanges();
    expect(text(element, '[data-row-view] fold-element-title')).toContain('Rangée 2');

    await scan(fixture, 'AAA222');
    expect(text(element, '[data-row-view] fold-element-title')).toContain('Rangée 1');
  });

  it('glisser au doigt vers la droite passe à la rangée d’après, vers la gauche revient', async () => {
    const { fixture, element } = await bootPlanned();
    // jsdom n'a pas de `PointerEvent` : un `MouseEvent` du même nom porte les
    // mêmes coordonnées, seules lues par le composant.
    const swipe = (fromX: number, toX: number): void => {
      const card = element.querySelector('[data-row-swipe]');
      card?.dispatchEvent(new MouseEvent('pointerdown', { clientX: fromX, clientY: 100 }));
      card?.dispatchEvent(new MouseEvent('pointerup', { clientX: toX, clientY: 105 }));
      fixture.detectChanges();
    };

    swipe(100, 300);
    expect(text(element, '[data-row-view] fold-element-title')).toContain('Rangée 2');
    swipe(300, 100);
    expect(text(element, '[data-row-view] fold-element-title')).toContain('Rangée 1');
    // Un toucher qui bouge à peine ne change rien.
    swipe(200, 180);
    expect(text(element, '[data-row-view] fold-element-title')).toContain('Rangée 1');
  });
});
