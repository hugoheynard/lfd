import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { DriverNoticeService } from '../driver-notice.service';
import { driverNoticeOf } from '../driver-notice.fixture';
import { DriverNoticeDialog } from './driver-notice-dialog';

interface Wire {
  readonly acknowledged: number[];
  readonly closes: unknown[];
  refuse: string | null;
}

let wire: Wire;

async function boot(refuse: string | null = null): Promise<ComponentFixture<DriverNoticeDialog>> {
  wire = { acknowledged: [], closes: [], refuse };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DriverNoticeDialog],
    providers: [
      {
        provide: DriverNoticeService,
        useValue: {
          acknowledge: (version: number): Promise<void> => {
            wire.acknowledged.push(version);
            return wire.refuse === null
              ? Promise.resolve()
              : Promise.reject(
                  new HttpErrorResponse({ status: 409, error: { message: wire.refuse } }),
                );
          },
        } satisfies Pick<DriverNoticeService, 'acknowledge'>,
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(DriverNoticeDialog);
  fixture.componentRef.setInput('data', { notice: driverNoticeOf(4) });
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const host = (fixture: ComponentFixture<DriverNoticeDialog>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

async function press(
  fixture: ComponentFixture<DriverNoticeDialog>,
  selector: string,
): Promise<void> {
  host(fixture).querySelector<HTMLElement>(selector)?.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('DriverNoticeDialog', () => {
  it('montre le texte complet : l’intro et chaque rubrique', async () => {
    const fixture = await boot();
    const text = host(fixture).textContent ?? '';

    expect(text).toContain('Avant de démarrer');
    expect(host(fixture).querySelectorAll('[data-notice-section]')).toHaveLength(2);
    expect(text).toContain('Durée en cours de définition.');
  });

  it('« J’ai compris » accuse la version lue, puis ferme pour partir', async () => {
    const fixture = await boot();

    await press(fixture, '[data-understood]');
    expect(wire.acknowledged).toEqual([4]);
    expect(wire.closes).toEqual([true]);
  });

  it('« Plus tard » ferme sans rien écrire', async () => {
    const fixture = await boot();

    await press(fixture, '[data-later]');
    expect(wire.acknowledged).toEqual([]);
    expect(wire.closes).toEqual([false]);
  });

  it('un refus reste affiché, dialogue ouvert', async () => {
    const fixture = await boot('Le texte a changé pendant votre lecture.');

    await press(fixture, '[data-understood]');
    expect(wire.closes).toEqual([]);
    expect(host(fixture).querySelector('[data-refusal]')?.textContent?.trim()).toBe(
      'Le texte a changé pendant votre lecture.',
    );
  });
});
