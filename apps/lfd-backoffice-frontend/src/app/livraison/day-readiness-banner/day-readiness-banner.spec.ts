import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DeliveryDayArrestView, DeliveryDayReadinessView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DeliveryRoundsService } from '../delivery-rounds.service';
import { DayReadinessBanner } from './day-readiness-banner';

const DAY = '2026-10-07';
const ARREST: DeliveryDayArrestView = {
  closedAt: '2026-10-06T16:00:00.000Z',
  deliveryCount: 12,
  unplacedCount: 3,
  compositionGap: null,
  due: null,
};

interface Mounted {
  readonly fixture: ComponentFixture<DayReadinessBanner>;
  readonly element: HTMLElement;
  readonly proposed: number[];
  readonly reads: string[];
}

async function settle(fixture: ComponentFixture<DayReadinessBanner>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function mount(
  read: () => Promise<DeliveryDayReadinessView>,
  canWrite = true,
): Promise<Mounted> {
  const reads: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: DeliveryRoundsService,
        useValue: {
          readiness: (day: string) => {
            reads.push(day);
            return read();
          },
        } satisfies Partial<Record<keyof DeliveryRoundsService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(DayReadinessBanner);
  fixture.componentRef.setInput('day', DAY);
  fixture.componentRef.setInput('canWrite', canWrite);
  const proposed: number[] = [];
  fixture.componentInstance.propose.subscribe(() => proposed.push(1));
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, element: fixture.nativeElement as HTMLElement, proposed, reads };
}

function arrested(arrest: DeliveryDayArrestView | null): () => Promise<DeliveryDayReadinessView> {
  return () => Promise.resolve({ day: DAY, arrested: arrest });
}

describe('DayReadinessBanner — le plan arrêté sur l’écran des tournées', () => {
  it('plan non arrêté : rien', async () => {
    const { element } = await mount(arrested(null));

    expect(element.textContent?.trim()).toBe('');
  });

  it('arrêté : le compte, les hors tournée, et « Proposer » mis en avant', async () => {
    const { element, proposed } = await mount(arrested(ARREST));

    const callout = element.querySelector('[data-readiness-arrested]');
    expect(callout?.textContent).toContain('Plan arrêté');
    expect(callout?.textContent).toContain('12 livraisons, dont 3 hors tournée');
    element.querySelector<HTMLButtonElement>('[data-readiness-propose]')?.click();
    expect(proposed).toHaveLength(1);
  });

  it('tout est placé, ou lecture seule : pas de bouton', async () => {
    const placed = await mount(arrested({ ...ARREST, unplacedCount: 0 }));
    expect(placed.element.querySelector('[data-readiness-propose]')).toBeNull();

    const reader = await mount(arrested(ARREST), false);
    expect(reader.element.querySelector('[data-readiness-propose]')).toBeNull();
  });

  it('arrêté sans flotte mesurée : l’alerte dit quoi régler (CA-D3)', async () => {
    const { element } = await mount(arrested({ ...ARREST, compositionGap: 'no_measured_vehicle' }));

    const gap = element.querySelector('[data-readiness-gap]');
    expect(gap?.textContent).toContain('impossible de proposer les tournées');
    expect(gap?.textContent).toContain('Livraison → Véhicules');
    expect(element.querySelector('[data-readiness-propose]')).toBeNull();
  });

  it('demain, des livraisons hors tournée : l’alerte avant le jour J (§5)', async () => {
    const { element, proposed } = await mount(arrested({ ...ARREST, due: 'tomorrow' }));

    const callout = element.querySelector('[data-readiness-imminent]');
    expect(callout?.textContent).toContain('Demain : 3 livraisons hors tournée');
    expect(callout?.textContent).toContain('12 livraisons');
    expect(element.querySelector('[data-readiness-arrested]')).toBeNull();
    element.querySelector<HTMLButtonElement>('[data-readiness-propose]')?.click();
    expect(proposed).toHaveLength(1);
  });

  it('aujourd’hui, au singulier ; tout placé : retour au succès', async () => {
    const today = await mount(arrested({ ...ARREST, due: 'today', unplacedCount: 1 }));
    expect(today.element.querySelector('[data-readiness-imminent]')?.textContent).toContain(
      'Aujourd’hui : 1 livraison hors tournée',
    );

    const placed = await mount(arrested({ ...ARREST, due: 'today', unplacedCount: 0 }));
    expect(placed.element.querySelector('[data-readiness-imminent]')).toBeNull();
    expect(placed.element.querySelector('[data-readiness-arrested]')).not.toBeNull();
  });

  it('une lecture en échec ne laisse pas croire que le plan est ouvert', async () => {
    const { element } = await mount(() => Promise.reject(new Error('hors ligne')));

    expect(element.querySelector('[data-readiness-failed]')).not.toBeNull();
  });

  it('relit quand la page change sa composition', async () => {
    const { fixture, reads } = await mount(arrested(ARREST));

    fixture.componentRef.setInput('refresh', {});
    await settle(fixture);

    expect(reads).toEqual([DAY, DAY]);
  });
});
