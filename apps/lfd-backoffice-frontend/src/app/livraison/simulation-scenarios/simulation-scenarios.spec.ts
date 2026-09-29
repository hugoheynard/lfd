import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DeliverySimulationScenarioSummaryView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../notify.service';
import { DeliverySimulationScenariosService } from '../delivery-simulation-scenarios.service';
import { SimulationScenarios } from './simulation-scenarios';

const ROW: DeliverySimulationScenarioSummaryView = {
  id: 'sc-1',
  name: 'Samedi de février',
  stops: 12,
  vehicles: 3,
  updatedAt: '2026-09-29T12:05:00.000Z',
  updatedBy: 'Marie',
};

interface Wire {
  rows: DeliverySimulationScenarioSummaryView[];
  failList: boolean;
  duplicated: string[];
  archived: string[];
  refuse: string | null;
}

let wire: Wire;

async function boot(canWrite: boolean): Promise<ComponentFixture<SimulationScenarios>> {
  wire = { rows: [ROW], failList: false, duplicated: [], archived: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SimulationScenarios],
    providers: [
      {
        provide: DeliverySimulationScenariosService,
        useValue: {
          list: () =>
            wire.failList ? Promise.reject(new Error('panne')) : Promise.resolve(wire.rows),
          duplicate: (id: string) => {
            wire.duplicated.push(id);
            return Promise.resolve();
          },
          archive: (id: string) => {
            if (wire.refuse !== null) {
              return Promise.reject(
                new HttpErrorResponse({ status: 409, error: { message: wire.refuse } }),
              );
            }
            wire.archived.push(id);
            return Promise.resolve();
          },
        } satisfies Pick<DeliverySimulationScenariosService, 'list' | 'duplicate' | 'archive'>,
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(SimulationScenarios);
  fixture.componentRef.setInput('canWrite', canWrite);
  fixture.componentRef.setInput('currentId', 'sc-1');
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<SimulationScenarios>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<SimulationScenarios>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('SimulationScenarios', () => {
  it('liste les scénarios, marque celui qui est à l’écran, et laisse ouvrir', async () => {
    const fixture = await boot(false);
    const opened: string[] = [];
    fixture.componentInstance.opened.subscribe((id) => opened.push(id));

    const text = host(fixture).textContent ?? '';
    expect(text).toContain('Samedi de février');
    expect(text).toContain('12 arrêts · 3 véhicules');
    expect(text).toContain('Marie');
    expect(text).toContain('À l’écran');
    host(fixture).querySelector<HTMLButtonElement>('[data-scenario-open]')?.click();
    expect(opened).toEqual(['sc-1']);
  });

  it('cache dupliquer et archiver sans droit d’écriture', async () => {
    const fixture = await boot(false);
    expect(host(fixture).querySelector('[data-scenario-duplicate]')).toBeNull();
    expect(host(fixture).querySelector('[data-scenario-archive]')).toBeNull();
  });

  it('duplique, puis relit la liste', async () => {
    const fixture = await boot(true);
    host(fixture).querySelector<HTMLButtonElement>('[data-scenario-duplicate]')?.click();
    await settle(fixture);
    expect(wire.duplicated).toEqual(['sc-1']);
  });

  it('dit le vide, et l’échec de lecture avec un nouvel essai', async () => {
    const fixture = await boot(true);
    wire.rows = [];
    wire.failList = true;
    fixture.componentRef.setInput('revision', 1);
    await settle(fixture);
    expect(host(fixture).querySelector('[data-scenarios-retry]')).not.toBeNull();

    wire.failList = false;
    host(fixture).querySelector<HTMLButtonElement>('[data-scenarios-retry]')?.click();
    await settle(fixture);
    expect(host(fixture).querySelector('[data-scenarios-empty]')).not.toBeNull();
  });
});
