import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import type { DeliveryRoundProposalView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../notify.service';
import { DeliveryRoutingService, type ProposalRequest } from '../delivery-routing.service';
import { PlannerPopover, type PlannerResult, type PlannerVehicle } from './planner-popover';

const VEHICLES: readonly PlannerVehicle[] = [
  { id: 'v-1', name: 'Kangoo blanc', color: 'red', sub: 'partie · exclue', excluded: true },
  { id: 'v-2', name: 'Trafic frigo', color: 'blue', sub: '4 arrêts', excluded: false },
  { id: 'v-3', name: 'Jumpy', color: 'green', sub: 'aucun arrêt', excluded: false },
];

// Seule la forme compte ici : la page l'affiche, le popover ne la lit pas.
const PROPOSAL = { day: '2026-10-02' } as DeliveryRoundProposalView;

interface Mounted {
  readonly fixture: ComponentFixture<PlannerPopover>;
  readonly element: HTMLElement;
  readonly requests: ProposalRequest[];
  readonly results: PlannerResult[];
}

async function mount(refuse: HttpErrorResponse | null = null): Promise<Mounted> {
  const requests: ProposalRequest[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: DeliveryRoutingService,
        useValue: {
          propose: (request: ProposalRequest) => {
            requests.push(request);
            return refuse === null ? Promise.resolve(PROPOSAL) : Promise.reject(refuse);
          },
          settings: () => Promise.reject(new Error('non lu')),
        } satisfies Partial<Record<keyof DeliveryRoutingService, unknown>>,
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
      { provide: Router, useValue: { navigateByUrl: () => Promise.resolve(true) } },
    ],
  });
  const fixture = TestBed.createComponent(PlannerPopover);
  fixture.componentRef.setInput('day', '2026-10-02');
  fixture.componentRef.setInput('vehicles', VEHICLES);
  fixture.componentRef.setInput('canWrite', true);
  fixture.detectChanges();
  fixture.componentInstance['open'].set(true);
  fixture.detectChanges();
  await fixture.whenStable();
  const results: PlannerResult[] = [];
  fixture.componentInstance.proposed.subscribe((result) => results.push(result));
  return { fixture, element: fixture.nativeElement as HTMLElement, requests, results };
}

async function propose(mounted: Mounted): Promise<void> {
  mounted.element.querySelector<HTMLButtonElement>('[data-propose]')?.click();
  await new Promise((resolve) => setTimeout(resolve));
  mounted.fixture.detectChanges();
}

describe('PlannerPopover', () => {
  it('dit « Recomposer » quand le jour a des tournées enregistrées, « Proposer » sinon', async () => {
    const mounted = await mount();
    const said = () =>
      [
        mounted.element.querySelector('[data-planner-open]'),
        mounted.element.querySelector('.heading'),
        mounted.element.querySelector('[data-propose]'),
      ].map((element) => element?.textContent?.trim());
    expect(said()).toEqual(['Proposer les tournées', 'Proposer les tournées', 'Proposer']);

    mounted.fixture.componentRef.setInput('saved', true);
    mounted.fixture.detectChanges();

    expect(said()).toEqual(['Recomposer les tournées', 'Recomposer les tournées', 'Recomposer']);
  });

  it('propose sur les véhicules cochés, jamais celui dont tout est parti, puis se ferme', async () => {
    const mounted = await mount();
    mounted.fixture.debugElement
      .queryAll(By.css('[data-vehicle]'))[2]
      ?.triggerEventHandler('checkedChange', false);
    await propose(mounted);

    expect(mounted.requests).toEqual([
      { day: '2026-10-02', vehicleIds: ['v-2'], recomposeAll: false, mode: null },
    ]);
    expect(mounted.results).toEqual([{ proposal: PROPOSAL, recomposed: false }]);
    expect(mounted.fixture.componentInstance['open']()).toBe(false);
  });

  it('« Tout recomposer » grise le mode, et le dit', async () => {
    const mounted = await mount();
    mounted.fixture.debugElement
      .query(By.css('[data-recompose-all]'))
      .triggerEventHandler('checkedChange', true);
    mounted.fixture.detectChanges();
    expect(mounted.element.querySelector('[data-mode-hint]')?.textContent).toContain(
      'Ignoré : « Tout recomposer » reprend tout.',
    );
    await propose(mounted);
    expect(mounted.requests[0]?.recomposeAll).toBe(true);
    expect(mounted.results[0]?.recomposed).toBe(true);
  });

  it('le refus du calcul s’affiche tel quel, et le panneau reste ouvert', async () => {
    const message = 'Le calcul routier ne répond pas : réessayez dans un instant.';
    const mounted = await mount(new HttpErrorResponse({ status: 503, error: { message } }));
    await propose(mounted);
    expect(mounted.element.querySelector('[data-planner-refusal]')?.textContent?.trim()).toBe(
      message,
    );
    expect(mounted.results).toEqual([]);
    expect(mounted.fixture.componentInstance['open']()).toBe(true);
  });
});
