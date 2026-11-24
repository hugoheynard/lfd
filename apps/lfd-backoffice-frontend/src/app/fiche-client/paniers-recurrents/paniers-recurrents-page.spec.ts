import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AdminRecurringOccurrenceView, AdminSubscriptionRow } from '@lfd/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { ClientPaniersRecurrentsPage } from './paniers-recurrents-page';

function occurrence(
  patch: Partial<AdminRecurringOccurrenceView> & Pick<AdminRecurringOccurrenceView, 'serviceDay'>,
): AdminRecurringOccurrenceView {
  return {
    state: 'planned',
    lines: [{ sku: 'PAIN-1', quantity: 2 }],
    overridden: false,
    note: '',
    orderId: null,
    cause: null,
    reason: null,
    settledAt: null,
    ...patch,
  };
}

function basket(patch: Partial<AdminSubscriptionRow> = {}): AdminSubscriptionRow {
  return {
    id: 'sub_1',
    recurrence: 'weekly',
    status: 'active',
    startDate: '2026-01-05',
    endDate: null,
    fulfillmentMethod: 'delivery',
    deliveryAddress: null,
    pickupAddressId: null,
    requestedWindow: { start: '07:00', end: '09:00' },
    note: '',
    lines: [{ sku: 'PAIN-1', quantity: 2 }],
    salesTerms: { document: 'salesTermsPro', revision: 3 },
    nextSalesTerms: null,
    occurrences: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    placedByUserId: 'u_1',
    placedByName: 'Camille Martin',
    ...patch,
  };
}

let http: HttpTestingController;

async function mount(
  rows: readonly AdminSubscriptionRow[],
): Promise<ComponentFixture<ClientPaniersRecurrentsPage>> {
  TestBed.configureTestingModule({
    imports: [ClientPaniersRecurrentsPage],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(ClientPaniersRecurrentsPage);
  fixture.componentRef.setInput('id', 'co_1');
  fixture.detectChanges();
  http.expectOne((req) => req.url.endsWith('/admin/companies/co_1/subscriptions')).flush(rows);
  // La lecture passe par une promesse : on laisse sa suite s'exécuter.
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<ClientPaniersRecurrentsPage>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('ClientPaniersRecurrentsPage', () => {
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it("dit l'acheteur, le créneau, la version des CGV et l'annonce à venir", async () => {
    const fixture = await mount([
      basket({ nextSalesTerms: { revision: 4, effectiveOn: '2026-12-01' } }),
    ]);
    const content = text(fixture);
    expect(content).toContain('Camille Martin');
    expect(content).toContain('De 07:00 à 09:00');
    expect(content).toContain('CGV version 3');
    expect(content).toContain('Nouvelles CGV (version 4) au');
  });

  it("annonce en texte l'état de chaque échéance et la mention « Modifiée »", async () => {
    const fixture = await mount([
      basket({
        occurrences: [
          occurrence({ serviceDay: '2026-11-02', state: 'skipped' }),
          occurrence({ serviceDay: '2026-11-09', state: 'planned', overridden: true }),
        ],
      }),
    ]);
    const content = text(fixture);
    expect(content).toContain('Sautée');
    expect(content).toContain('Prévue');
    expect(content).toContain('Modifiée');
  });

  it('lie la commande passée à sa fiche sous la coquille du compte', async () => {
    const fixture = await mount([
      basket({
        occurrences: [occurrence({ serviceDay: '2026-11-02', state: 'placed', orderId: 'ord_9' })],
      }),
    ]);
    const link = (fixture.nativeElement as HTMLElement).querySelector('a');
    expect(link?.getAttribute('href')).toBe('/comptes-clients/co_1/commandes/ord_9');
  });

  it("met en évidence une échéance refusée avec la phrase du refus et l'heure de l'issue", async () => {
    const fixture = await mount([
      basket({
        occurrences: [
          occurrence({
            serviceDay: '2026-11-02',
            state: 'refused',
            cause: 'deadline_closed',
            reason: "L'heure limite était passée : repasser la commande à la main.",
            settledAt: '2026-10-26T08:00:00.000Z',
          }),
        ],
      }),
    ]);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.rec-occurrence--attention')).toHaveLength(1);
    expect(text(fixture)).toContain("L'heure limite était passée");
    expect(text(fixture)).toContain('Issue le 26/10/2026');
    expect(text(fixture)).toContain('1 échéance refusée');
  });

  it("montre l'état vide de fold sans panier", async () => {
    const fixture = await mount([]);
    expect(text(fixture)).toContain('Aucun panier récurrent');
  });
});
