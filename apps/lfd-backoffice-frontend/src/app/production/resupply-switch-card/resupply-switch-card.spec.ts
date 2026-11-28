import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { ResupplySwitchView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ResupplySwitchStore } from '../../shared/resupply-switch/resupply-switch.store';
import { ResupplySwitchCard } from './resupply-switch-card';

interface Wire {
  sent: boolean[];
  refuse: string | null;
}

let wire: Wire;

async function boot(
  served: ResupplySwitchView | null,
  canWrite = true,
  failed = false,
): Promise<ComponentFixture<ResupplySwitchCard>> {
  wire = { sent: [], refuse: null };
  const view = signal(served);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResupplySwitchCard],
    providers: [
      {
        provide: ResupplySwitchStore,
        useValue: {
          view,
          enabled: () => view()?.enabled ?? false,
          loadFailed: () => failed,
          ensureLoaded: () => Promise.resolve(),
          set: (enabled: boolean) => {
            wire.sent.push(enabled);
            if (wire.refuse !== null) {
              return Promise.reject(
                new HttpErrorResponse({ status: 409, error: { code: 'x', message: wire.refuse } }),
              );
            }
            view.set({ enabled, updatedAt: '2026-11-28T09:30:00.000Z', updatedBy: 'Lou' });
            return Promise.resolve();
          },
        } satisfies Record<keyof ResupplySwitchStore, unknown>,
      },
    ],
  });
  const fixture = TestBed.createComponent(ResupplySwitchCard);
  fixture.componentRef.setInput('canWrite', canWrite);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<ResupplySwitchCard>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function check(fixture: ComponentFixture<ResupplySwitchCard>, value: boolean): void {
  fixture.debugElement
    .query(By.css('[data-resupply-enabled]'))
    .triggerEventHandler('checkedChange', value);
}

function text(fixture: ComponentFixture<ResupplySwitchCard>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

const NEVER_SET: ResupplySwitchView = { enabled: false, updatedAt: null, updatedBy: null };

describe('ResupplySwitchCard', () => {
  it('jamais posé, dit qu’il est éteint par défaut', async () => {
    const fixture = await boot(NEVER_SET);
    expect(text(fixture)).toContain('Jamais posé : éteint par défaut.');
  });

  it('cocher allume d’un geste, et dit qui l’a posé', async () => {
    const fixture = await boot(NEVER_SET);

    check(fixture, true);
    await settle(fixture);

    expect(wire.sent).toEqual([true]);
    expect(text(fixture)).toContain('Modifié par Lou, le 28 novembre 2026');
  });

  it('un refus se dit avec les mots du serveur', async () => {
    const fixture = await boot(NEVER_SET);
    wire.refuse = 'Réglage refusé.';

    check(fixture, true);
    await settle(fixture);

    expect(
      fixture.nativeElement.querySelector('[data-resupply-switch-refusal]')?.textContent?.trim(),
    ).toBe('Réglage refusé.');
  });

  it('sans droit d’écriture, le geste ne part pas', async () => {
    const fixture = await boot({ enabled: true, updatedAt: null, updatedBy: null }, false);

    check(fixture, false);
    await settle(fixture);

    expect(wire.sent).toEqual([]);
  });

  it('une lecture échouée se dit, sans case qui mentirait', async () => {
    const fixture = await boot(null, true, true);
    expect(fixture.nativeElement.querySelector('[data-resupply-switch-failed]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-resupply-enabled]')).toBeNull();
  });
});
