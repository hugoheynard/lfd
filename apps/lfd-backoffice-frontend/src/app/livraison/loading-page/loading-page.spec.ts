import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { DeliveryLoadingDayView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DeliveryLoadingService } from '../delivery-loading.service';
import { parisDayOf } from '../run-sheet';
import { LoadingPage } from './loading-page';

let reads: string[];

function day(value: string): DeliveryLoadingDayView {
  return {
    day: value,
    rounds: [
      {
        roundId: 'r-1',
        vehicleName: 'Kangoo',
        passage: 2,
        departedAt: null,
        stops: 5,
        loadedStops: 3,
        stopsWithBinToRedo: 1,
      },
      {
        roundId: 'r-2',
        vehicleName: 'Master',
        passage: 1,
        departedAt: '2026-10-01T05:42:00.000Z',
        stops: 2,
        loadedStops: 2,
        stopsWithBinToRedo: 0,
      },
    ],
  };
}

async function settle(fixture: ComponentFixture<LoadingPage>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function boot(
  query: Record<string, string> = {},
  read: (value: string) => Promise<DeliveryLoadingDayView> = (value) => Promise.resolve(day(value)),
): Promise<HTMLElement> {
  reads = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
      },
      {
        provide: DeliveryLoadingService,
        useValue: {
          day: (value: string) => {
            reads.push(value);
            return read(value);
          },
        } satisfies Partial<Record<keyof DeliveryLoadingService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(LoadingPage);
  fixture.detectChanges();
  await settle(fixture);
  return fixture.nativeElement as HTMLElement;
}

describe('LoadingPage', () => {
  it('lit aujourd’hui par défaut : on charge le jour du départ', async () => {
    await boot();
    expect(reads).toEqual([parisDayOf(new Date())]);
  });

  it('lit le jour de l’URL, et propose de charger chaque tournée', async () => {
    const element = await boot({ jour: '2026-10-01' });
    expect(reads).toEqual(['2026-10-01']);
    const card = element.querySelector('[data-round]');
    expect(card?.textContent).toContain('Kangoo · passage 2');
    expect(card?.textContent).toContain('3 arrêts chargés sur 5');
    expect(element.querySelectorAll('[data-round]')[1]?.textContent).toContain('Partie à 7 h 42');
    // 🔴 un bac partagé à refaire se voit dès la liste (v2-4) ; la tournée partie n'en dit rien.
    expect(card?.querySelector('[data-round-to-redo]')?.textContent).toContain('1 arrêt à refaire');
    expect(
      element.querySelectorAll('[data-round]')[1]?.querySelector('[data-round-to-redo]'),
    ).toBeNull();
    expect(card?.querySelector('a[data-open-round]')?.getAttribute('href')).toBe(
      '/livraison/chargement/r-1?jour=2026-10-01',
    );
  });

  it('dit l’échec de lecture en alerte', async () => {
    const element = await boot({}, () => Promise.reject(new Error('500')));
    expect(element.querySelector('[data-rounds-error]')?.getAttribute('tone')).toBe('alert');
  });
});
