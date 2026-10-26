import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DeliveryDayArrestView, DeliveryDayReadinessView } from '@lfd/contracts';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { By } from '@angular/platform-browser';
import { FoldCalloutComponent } from 'fold-ng';

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
  readonly auto: number[];
  readonly byHand: number[];
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
      { provide: Router, useValue: { navigateByUrl: () => Promise.resolve(true) } },
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
  const auto: number[] = [];
  const byHand: number[] = [];
  fixture.componentInstance.autoPlace.subscribe(() => auto.push(1));
  fixture.componentInstance.placeByHand.subscribe(() => byHand.push(1));
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, element: fixture.nativeElement as HTMLElement, auto, byHand, reads };
}

function arrested(arrest: DeliveryDayArrestView | null): () => Promise<DeliveryDayReadinessView> {
  return () => Promise.resolve({ day: DAY, arrested: arrest });
}

describe('DayReadinessBanner — le plan arrêté sur l’écran des tournées', () => {
  it('plan non arrêté : rien', async () => {
    const { element } = await mount(arrested(null));

    expect(element.textContent?.trim()).toBe('');
  });

  it('hors tournée : ce qu’il reste à faire, le plan en discret, et les deux gestes', async () => {
    const { element, auto, byHand } = await mount(arrested(ARREST));

    const callout = element.querySelector('[data-readiness-unplaced]');
    expect(callout?.querySelector('[data-readiness-headline]')?.textContent).toContain(
      '3 livraisons ne sont dans aucune tournée.',
    );
    expect(callout?.querySelector('[data-readiness-aside]')?.textContent).toContain(
      'Plan arrêté — 12 livraisons',
    );
    element.querySelector<HTMLButtonElement>('[data-readiness-auto]')?.click();
    element.querySelector<HTMLButtonElement>('[data-readiness-by-hand]')?.click();
    expect(auto).toHaveLength(1);
    expect(byHand).toHaveLength(1);
  });

  it('tout placé : « toutes en tournée », sans bouton ; en lecture seule, pas de geste', async () => {
    const placed = await mount(arrested({ ...ARREST, unplacedCount: 0 }));
    expect(placed.element.querySelector('[data-readiness-arrested]')?.textContent).toContain(
      '12 livraisons, toutes en tournée',
    );
    expect(placed.element.querySelector('button')).toBeNull();

    const reader = await mount(arrested(ARREST), false);
    expect(reader.element.querySelector('[data-readiness-unplaced]')).not.toBeNull();
    expect(reader.element.querySelector('button')).toBeNull();
  });

  it('le refus du calcul s’affiche dans l’encadré, avec le lien vers le réglage', async () => {
    const { fixture, element } = await mount(arrested(ARREST));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    fixture.componentRef.setInput('refusal', 'Aucun véhicule en service n’a ses cotes.');
    fixture.detectChanges();

    const refusal = element.querySelector('[data-readiness-unplaced] [data-readiness-refusal]');
    expect(refusal?.textContent).toContain('Aucun véhicule en service n’a ses cotes.');
    fixture.debugElement.query(By.css('[data-readiness-settings]')).triggerEventHandler('clicked');
    expect(navigate).toHaveBeenCalledWith('/reglages/livraison/depart');
  });

  it('arrêté sans flotte mesurée : l’alerte dit quoi régler (CA-D3)', async () => {
    const { element } = await mount(arrested({ ...ARREST, compositionGap: 'no_measured_vehicle' }));

    const gap = element.querySelector('[data-readiness-gap]');
    expect(gap?.textContent).toContain('impossible de proposer les tournées');
    expect(gap?.textContent).toContain('Réglages › Livraison › Véhicules');
    expect(element.querySelector('[data-readiness-auto]')).toBeNull();
  });

  it('demain, des livraisons hors tournée : l’encadré passe en avertissement (§5)', async () => {
    const { fixture, element } = await mount(arrested({ ...ARREST, due: 'tomorrow' }));

    const callout = fixture.debugElement.query(By.css('[data-readiness-unplaced]'));
    expect((callout.componentInstance as FoldCalloutComponent).variant()).toBe('warning');
    expect(element.querySelector('[data-readiness-aside]')?.textContent).toContain(
      'Demain · plan arrêté — 12 livraisons',
    );
  });

  it('aujourd’hui, au singulier', async () => {
    const today = await mount(arrested({ ...ARREST, due: 'today', unplacedCount: 1 }));
    expect(today.element.querySelector('[data-readiness-headline]')?.textContent).toContain(
      '1 livraison n’est dans aucune tournée.',
    );
    expect(today.element.querySelector('[data-readiness-aside]')?.textContent).toContain(
      'Aujourd’hui',
    );
  });

  it('jour passé : un constat, sans bouton', async () => {
    const all = await mount(arrested({ ...ARREST, unplacedCount: 0 }));
    all.fixture.componentRef.setInput('past', true);
    all.fixture.detectChanges();
    expect(all.element.querySelector('[data-readiness-past]')?.textContent).toContain(
      'Journée passée — 12 livraisons, toutes parties en tournée',
    );

    const some = await mount(arrested({ ...ARREST, unplacedCount: 2 }));
    some.fixture.componentRef.setInput('past', true);
    some.fixture.detectChanges();
    const callout = some.fixture.debugElement.query(By.css('[data-readiness-past]'));
    expect((callout.componentInstance as FoldCalloutComponent).variant()).toBe('warning');
    expect(callout.nativeElement.textContent).toContain(
      '12 livraisons, dont 2 jamais placées en tournée',
    );
    expect(some.element.querySelector('button')).toBeNull();
    expect(some.element.querySelector('[data-readiness-unplaced]')).toBeNull();

    const never = await mount(arrested(null));
    never.fixture.componentRef.setInput('past', true);
    never.fixture.detectChanges();
    expect(never.element.querySelector('[data-readiness-past]')?.textContent).toContain(
      'le plan n’a pas été arrêté ce jour-là',
    );
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
