import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { DeliveryRoutingSettingsPayload, DeliveryRoutingSettingsView } from '@lfd/contracts';
import { FoldNumberInputComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../notify.service';
import { DeliveryRoutingService } from '../delivery-routing.service';
import { RoutingSettingsCard } from './routing-settings-card';

const FACTORY: DeliveryRoutingSettingsView = {
  detourPercent: 140,
  averageSpeedKmh: 35,
  earliestDeparture: '07:00',
  maxRoundMinutes: 240,
  stopMinutes: 5,
  defaultMode: 'insert',
  multiplePassages: true,
  source: 'default',
};

interface Wire {
  view: DeliveryRoutingSettingsView;
  reads: number;
  writes: DeliveryRoutingSettingsPayload[];
  refuse: string | null;
}

let wire: Wire;

async function boot(canWrite = true): Promise<ComponentFixture<RoutingSettingsCard>> {
  wire = { view: FACTORY, reads: 0, writes: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [RoutingSettingsCard],
    providers: [
      {
        provide: DeliveryRoutingService,
        useValue: {
          settings: () => {
            wire.reads += 1;
            return Promise.resolve(wire.view);
          },
          saveSettings: (payload: DeliveryRoutingSettingsPayload) => {
            wire.writes.push(payload);
            if (wire.refuse !== null) {
              return Promise.reject(
                new HttpErrorResponse({ status: 400, error: { message: wire.refuse } }),
              );
            }
            wire.view = { ...payload, source: 'explicit' };
            return Promise.resolve();
          },
        } satisfies Partial<Record<keyof DeliveryRoutingService, unknown>>,
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(RoutingSettingsCard);
  fixture.componentRef.setInput('canWrite', canWrite);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<RoutingSettingsCard>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<RoutingSettingsCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function saveButton(fixture: ComponentFixture<RoutingSettingsCard>): HTMLButtonElement | null {
  return host(fixture).querySelector<HTMLButtonElement>('button[data-save-routing]');
}

function numberInput(fixture: ComponentFixture<RoutingSettingsCard>, selector: string) {
  const found = fixture.debugElement.query(By.css(selector));
  expect(found.componentInstance).toBeInstanceOf(FoldNumberInputComponent);
  return found;
}

describe('RoutingSettingsCard', () => {
  it('dit « par défaut » tant que personne n’a réglé, et lit le détour en facteur', async () => {
    const fixture = await boot();

    expect(host(fixture).textContent).toContain('Par défaut');
    const detour = numberInput(fixture, '[data-detour]')
      .componentInstance as FoldNumberInputComponent;
    expect(detour.value()).toBe(1.4);
  });

  it('n’enregistre rien tant que rien n’a changé', async () => {
    const fixture = await boot();

    expect(saveButton(fixture)?.disabled).toBe(true);
  });

  it('enregistre le détour en centièmes, puis relit la provenance', async () => {
    const fixture = await boot();
    numberInput(fixture, '[data-detour]').triggerEventHandler('valueChange', 1.35);
    await settle(fixture);
    saveButton(fixture)?.click();
    await settle(fixture);

    expect(wire.writes).toEqual([
      {
        detourPercent: 135,
        averageSpeedKmh: 35,
        earliestDeparture: '07:00',
        maxRoundMinutes: 240,
        stopMinutes: 5,
        defaultMode: 'insert',
        multiplePassages: true,
      },
    ]);
    expect(wire.reads).toBe(2);
    expect(host(fixture).textContent).toContain('Réglé par l’équipe');
  });

  it('affiche le refus du serveur tel quel', async () => {
    const fixture = await boot();
    wire.refuse = 'Le facteur de détour ne descend pas sous ×1.';
    numberInput(fixture, '[data-speed]').triggerEventHandler('valueChange', 40);
    await settle(fixture);
    saveButton(fixture)?.click();
    await settle(fixture);

    expect(host(fixture).querySelector('[data-routing-refusal]')?.textContent).toContain(
      'Le facteur de détour ne descend pas sous ×1.',
    );
  });

  it('n’enregistre pas un brouillon incomplet', async () => {
    const fixture = await boot();
    numberInput(fixture, '[data-stop-minutes]').triggerEventHandler('valueChange', null);
    await settle(fixture);

    expect(saveButton(fixture)?.disabled).toBe(true);
  });

  it('sans droit d’écriture : lecture seule, pas d’Enregistrer', async () => {
    const fixture = await boot(false);

    expect(saveButton(fixture)).toBeNull();
    const detour = numberInput(fixture, '[data-detour]')
      .componentInstance as FoldNumberInputComponent;
    expect(detour.readOnly()).toBe(true);
  });
});
