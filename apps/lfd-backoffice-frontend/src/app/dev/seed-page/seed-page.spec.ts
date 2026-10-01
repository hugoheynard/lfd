import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { DevSeedDriverReport, DevSeedOrdersOnlyReport } from '@lfd/contracts';

import { NotifyService } from '../../notify.service';
import { DevSeedService } from '../dev-seed.service';
import { DevSeedPage } from './seed-page';

/**
 * Le compte rendu du rechargement dit à qui la tournée chargée est affectée —
 * et n'offre « Ma tournée » que lorsqu'elle l'est au requérant (2026-10-01).
 */
function reportWith(driver: DevSeedDriverReport): DevSeedOrdersOnlyReport {
  return {
    orders: {
      removed: 0,
      placed: 40,
      yesterday: 'hier',
      today: 'aujourd’hui',
      counterToday: 3,
      peakDay: 'J+2',
    },
    delivery: {
      day: 'aujourd’hui',
      deliveries: 15,
      notReady: 3,
      vehicles: 3,
      rounds: 1,
      loadedBins: 9,
      unassigned: 10,
      driver,
    },
    storage: [],
  };
}

class FakeSeeding {
  constructor(private readonly report: DevSeedOrdersOnlyReport) {}
  reloadOrders(): Promise<DevSeedOrdersOnlyReport> {
    return Promise.resolve(this.report);
  }
}

class SilentNotify {
  success(): void {}
  error(): void {}
}

async function reloaded(driver: DevSeedDriverReport): Promise<ComponentFixture<DevSeedPage>> {
  TestBed.configureTestingModule({
    imports: [DevSeedPage],
    providers: [
      provideRouter([]),
      { provide: DevSeedService, useValue: new FakeSeeding(reportWith(driver)) },
      { provide: NotifyService, useValue: new SilentNotify() },
    ],
  });
  const fixture = TestBed.createComponent(DevSeedPage);
  fixture.detectChanges();
  const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.includes('Recharger les commandes'),
  );
  button?.click();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const myRoundLink = (fixture: ComponentFixture<DevSeedPage>): HTMLAnchorElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector('a[href="/livraison/ma-tournee"]');

const text = (fixture: ComponentFixture<DevSeedPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

describe('DevSeedPage — le livreur de la tournée chargée', () => {
  it('nomme le requérant et ouvre « Ma tournée » quand la tournée lui est affectée', async () => {
    const fixture = await reloaded({ status: 'assigned', name: 'Hugo Heynard' });

    expect(text(fixture)).toContain('Vous (Hugo Heynard)');
    expect(myRoundLink(fixture)).not.toBeNull();
  });

  it('dit le refus du serveur, sans lien, quand le droit de conduire manque', async () => {
    const fixture = await reloaded({
      status: 'refused',
      reason: 'Cette personne ne peut pas conduire « Camionnette 1 ».',
    });

    expect(text(fixture)).toContain('ne peut pas conduire « Camionnette 1 »');
    expect(myRoundLink(fixture)).toBeNull();
  });
});
