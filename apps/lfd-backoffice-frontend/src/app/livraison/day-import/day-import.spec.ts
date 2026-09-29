import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DeliverySimulationFromDayView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DeliverySimulationScenariosService } from '../delivery-simulation-scenarios.service';
import { DayImport } from './day-import';

let refuse: string | null;
let asked: string[];

async function boot(): Promise<ComponentFixture<DayImport>> {
  refuse = null;
  asked = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DayImport],
    providers: [
      {
        provide: DeliverySimulationScenariosService,
        useValue: {
          fromDay: (day: string): Promise<DeliverySimulationFromDayView> => {
            asked.push(day);
            return Promise.reject(
              new HttpErrorResponse({ status: 400, error: { message: refuse ?? 'refus' } }),
            );
          },
        } satisfies Pick<DeliverySimulationScenariosService, 'fromDay'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(DayImport);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const host = (fixture: ComponentFixture<DayImport>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('DayImport', () => {
  it('nomme la journée choisie sur le bouton, aujourd’hui par défaut', async () => {
    const fixture = await boot();
    expect(host(fixture).querySelector('[data-from-day]')?.textContent).toContain(
      'Partir de la journée du ',
    );
  });

  it('dit le refus du serveur sans rien charger', async () => {
    const fixture = await boot();
    refuse = 'Aucune livraison ce jour-là.';
    const loaded: DeliverySimulationFromDayView[] = [];
    fixture.componentInstance.loaded.subscribe((view) => loaded.push(view));
    host(fixture).querySelector<HTMLButtonElement>('[data-from-day]')?.click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    expect(asked).toHaveLength(1);
    expect(loaded).toHaveLength(0);
    expect(host(fixture).querySelector('[data-from-day-refusal]')?.textContent).toContain(
      'Aucune livraison ce jour-là.',
    );
  });
});
