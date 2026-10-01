import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DeliveryLoadingRoundView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

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
