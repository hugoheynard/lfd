import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { UndeliveredStopView, UndeliveredStopsView } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { DeliveryIncidentsService } from '../delivery-incidents.service';
import { UndeliveredPage } from './undelivered-page';

function stopOf(overrides: Partial<UndeliveredStopView> = {}): UndeliveredStopView {
  return {
    roundId: 'r-1',
    vehicleName: 'Kangoo',
    passage: 2,
    serviceDay: '2026-09-29',
    stopId: 's-1',
    orderId: 'o-1',
    reference: 'CMD-1',
    customerLabel: 'Refuge 1950',
    departedAt: '2026-09-29T05:42:00.000Z',
    returnedAt: '2026-09-29T10:30:00.000Z',
    arrivedAt: null,
    incidents: [],
    ...overrides,
  };
}

interface Wire {
  read: () => Promise<UndeliveredStopsView>;
  readonly calls: string[];
}

async function boot(
  read: Wire['read'],
): Promise<{ fixture: ComponentFixture<UndeliveredPage>; element: HTMLElement; wire: Wire }> {
  const wire: Wire = { read, calls: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: DeliveryIncidentsService,
        useValue: {
          undelivered: () => {
            wire.calls.push('undelivered');
            return wire.read();
          },
          photo: (incidentId: string): Promise<Blob> => {
            wire.calls.push(`photo ${incidentId}`);
            return Promise.resolve(new Blob(['x']));
          },
        } satisfies Partial<Record<keyof DeliveryIncidentsService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(UndeliveredPage);
  await settle(fixture);
  return { fixture, element: fixture.nativeElement as HTMLElement, wire };
}

async function settle(fixture: ComponentFixture<UndeliveredPage>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('UndeliveredPage', () => {
  it('dit qu’elle ne débloque rien : à traiter hors application, en attendant les reports', async () => {
    const { element } = await boot(() => Promise.resolve({ before: '2026-10-01', stops: [] }));
    expect(element.querySelector('[data-out-of-app]')?.textContent).toContain(
      'à traiter hors application, en attendant les reports',
    );
    expect(element.querySelector('[data-empty]')?.textContent).toContain('Aucun arrêt non remis');
  });

  it('montre le jour, la tournée, le client et les signalements, photo à la demande', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:incident');
    const { fixture, element, wire } = await boot(() =>
      Promise.resolve({
        before: '2026-10-01',
        stops: [
          stopOf({
            arrivedAt: '2026-09-29T07:05:00.000Z',
            incidents: [
              {
                id: 'i-1',
                roundId: 'r-1',
                stopId: 's-1',
                orderReference: 'CMD-1',
                family: 'doorstep',
                reason: 'access_impossible',
                note: 'Portail fermé',
                hasPhoto: true,
                reportedAt: '2026-09-29T07:10:00.000Z',
                reportedBy: { staffUserId: 'u-1', name: null },
              },
            ],
          }),
          stopOf({ stopId: 's-2', reference: 'CMD-2', returnedAt: null }),
        ],
      }),
    );
    const cards = element.querySelectorAll('[data-undelivered]');
    expect(cards).toHaveLength(2);
    const first = cards[0]?.textContent ?? '';
    expect(first).toContain('CMD-1 · Refuge 1950');
    expect(first).toContain('Kangoo · passage 2');
    expect(first).toMatch(/29 septembre/u);
    expect(first).toContain('9 h 05');
    expect(first).toContain('Problème à la remise · Accès impossible');
    expect(first).toContain('Portail fermé');
    expect(cards[1]?.textContent).toContain('Jamais déclarée');
    expect(cards[1]?.textContent).toContain('Aucun problème signalé.');

    cards[0]?.querySelector<HTMLElement>('[data-open-photo]')?.click();
    await settle(fixture);
    expect(wire.calls).toContain('photo i-1');
  });

  it('illisible : le dit, et relit sur demande', async () => {
    let fail = true;
    const { fixture, element, wire } = await boot(() =>
      fail
        ? Promise.reject(new Error('réseau'))
        : Promise.resolve({ before: '2026-10-01', stops: [] }),
    );
    expect(element.querySelector('[data-error]')).not.toBeNull();

    fail = false;
    element.querySelector<HTMLButtonElement>('[data-error] button')?.click();
    await settle(fixture);
    expect(wire.calls).toEqual(['undelivered', 'undelivered']);
    expect(element.querySelector('[data-empty]')).not.toBeNull();
  });
});
