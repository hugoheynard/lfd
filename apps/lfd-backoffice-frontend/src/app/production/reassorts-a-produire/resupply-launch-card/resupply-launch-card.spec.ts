import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { ResupplyProductionDayView, SiteResupplyView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { BakehouseResuppliesService } from '../bakehouse-resupplies.service';
import { ResupplyLaunchCard } from './resupply-launch-card';

/** « Lancer » (R4a) : le fournil ajoute un « au plus tôt » envoyé au plan du jour. */
function resupply(
  id: string,
  siteId: string,
  extra: Partial<SiteResupplyView> = {},
): SiteResupplyView {
  return {
    id,
    siteId,
    serviceDay: '2026-01-03',
    target: 'asap',
    origin: 'counter',
    name: null,
    status: 'placed',
    lines: [{ sku: 'CRO', label: 'Croissant', quantity: 6 }],
    placedAt: '2026-01-03T06:00:00.000Z',
    placedBy: null,
    cancelledAt: null,
    cancelledBy: null,
    arrivedAt: null,
    arrivedBy: null,
    launchedAt: null,
    launchedBy: null,
    ...extra,
  };
}

const VIEW: ResupplyProductionDayView = {
  serviceDay: '2026-01-03',
  planStopped: true,
  transferSiteIds: ['village'],
  sites: [
    {
      siteId: 'village',
      siteLabel: 'Val Village',
      resupplies: [
        resupply('r1', 'village', { name: 'Vitrine du midi' }),
        resupply('r2', 'village', {
          launchedAt: '2026-01-03T08:40:00.000Z',
          launchedBy: 'Max',
        }),
        resupply('r3', 'village', { status: 'cancelled' }),
        resupply('r4', 'village', { target: 'tomorrow' }),
      ],
    },
    { siteId: 'labo', siteLabel: 'Le Labo', resupplies: [resupply('r5', 'labo')] },
  ],
  totals: [],
  articles: [],
};

class FakeService {
  readonly calls: string[] = [];
  failure: unknown = null;
  launch(serviceDay: string, resupplyId: string): Promise<void> {
    this.calls.push(`${serviceDay} ${resupplyId}`);
    return this.failure === null ? Promise.resolve() : Promise.reject(this.failure);
  }
}

function mount(canLaunch: boolean) {
  const service = new FakeService();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResupplyLaunchCard],
    providers: [{ provide: BakehouseResuppliesService, useValue: service }],
  });
  const fixture = TestBed.createComponent(ResupplyLaunchCard);
  fixture.componentRef.setInput('view', VIEW);
  fixture.componentRef.setInput('canLaunch', canLaunch);
  let launched = 0;
  fixture.componentInstance.launched.subscribe(() => (launched += 1));
  fixture.detectChanges();
  return { fixture, service, root: fixture.nativeElement as HTMLElement, launched: () => launched };
}

function button(root: HTMLElement, id: string): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(
    `[data-resupply-launch-row="${id}"] [data-resupply-launch]`,
  );
}

describe('ResupplyLaunchCard', () => {
  it('ne liste que les « au plus tôt » envoyés, tous points', () => {
    const { root } = mount(true);

    const rows = [...root.querySelectorAll('[data-resupply-launch-row]')].map((row) =>
      row.getAttribute('data-resupply-launch-row'),
    );
    expect(rows).toEqual(['r1', 'r2', 'r5']);
    expect(root.querySelector('[data-resupply-launch-row="r1"]')?.textContent).toContain(
      'Vitrine du midi — Val Village',
    );
  });

  it('« Lancer » vise la journée de la vue, prévient l’onglet ; un lancé dit qui et quand', async () => {
    const { root, service, fixture, launched } = mount(true);

    expect(button(root, 'r2')).toBeNull();
    expect(root.querySelector('[data-resupply-launched-by]')?.textContent).toContain(
      'Lancé par Max à 09:40',
    );
    button(root, 'r1')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.calls).toEqual(['2026-01-03 r1']);
    expect(launched()).toBe(1);
    // L'affichage du serveur suit le fait : le poste ne repropose pas « Lancer ».
    expect(button(root, 'r1')).toBeNull();
  });

  it('un refus du serveur reste affiché tel quel ; sans le droit, aucun bouton', async () => {
    const { root, service, fixture, launched } = mount(true);
    service.failure = new HttpErrorResponse({
      status: 409,
      error: { message: 'Ce réassort « au plus tôt » est déjà lancé.' },
    });

    button(root, 'r1')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('fold-callout')?.textContent).toContain('déjà lancé');
    expect(launched()).toBe(0);
    expect(mount(false).root.querySelector('[data-resupply-launch]')).toBeNull();
  });
});
