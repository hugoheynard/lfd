import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CustomerRequestView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { CustomerRequestsService } from '../customer-requests.service';
import { CustomerRequestCard } from './customer-request-card';

/** L'enveloppe commune, et les détails choisis par le type — rien pour un contact. */

const CONTACT: CustomerRequestView = {
  id: 'cr_1',
  kind: 'contact',
  reasonId: 'rr_1',
  reasonLabel: 'Une question',
  priority: 'urgent',
  audience: 'b2c',
  authorName: 'Jeanne',
  authorEmail: 'jeanne@example.fr',
  authorPhone: '',
  message: 'Bonjour',
  userId: null,
  companyId: null,
  receivedAt: '2026-10-09T08:00:00.000Z',
  handledAt: null,
  handledBy: null,
  anonymizedAt: null,
  details: { kind: 'contact' },
};

async function mount(request: CustomerRequestView): Promise<ComponentFixture<CustomerRequestCard>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CustomerRequestCard],
    providers: [
      provideRouter([]),
      { provide: CustomerRequestsService, useValue: { photo: () => Promise.resolve(new Blob()) } },
    ],
  });
  const fixture = TestBed.createComponent(CustomerRequestCard);
  fixture.componentRef.setInput('request', request);
  fixture.componentRef.setInput('canHandle', true);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<CustomerRequestCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('CustomerRequestCard', () => {
  it('dit le motif, le type, la priorité et le message', async () => {
    const fixture = await mount(CONTACT);
    expect(host(fixture).textContent).toContain('Une question');
    expect(host(fixture).querySelector('[data-kind]')?.textContent).toContain('Contact');
    expect(host(fixture).querySelector('[data-priority]')?.textContent).toContain('Urgente');
    expect(host(fixture).querySelector('[data-text]')?.textContent).toContain('Bonjour');
    expect(host(fixture).querySelector('app-order-problem-details')).toBeNull();
  });

  it('un problème de commande rend ses détails par leur propre composant', async () => {
    const fixture = await mount({
      ...CONTACT,
      kind: 'order_problem',
      details: { kind: 'order_problem', orderId: 'o_1', orderNumber: 'C-0001', photos: [] },
    });
    expect(host(fixture).querySelector('[data-kind]')?.textContent).toContain(
      'Problème de commande',
    );
    expect(
      host(fixture).querySelector('app-order-problem-details a[data-order-link]'),
    ).not.toBeNull();
  });

  it('« Marquer traité » remonte à la boîte, sans rien écrire', async () => {
    const fixture = await mount(CONTACT);
    let asked = 0;
    fixture.componentInstance.handle.subscribe(() => (asked += 1));
    host(fixture).querySelector<HTMLButtonElement>('button[data-handle]')?.click();
    expect(asked).toBe(1);
  });
});
