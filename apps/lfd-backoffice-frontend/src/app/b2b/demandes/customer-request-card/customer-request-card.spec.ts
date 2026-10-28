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

  it('une réponse par e-mail rend son texte hostile en TEXTE, et présume compte et adresse', async () => {
    const hostile = '<script>alert(1)</script>\n<a href="https://evil.example">clic</a>';
    const fixture = await mount({
      ...CONTACT,
      kind: 'email_reply',
      message: hostile,
      companyId: 'co_1',
      details: {
        kind: 'email_reply',
        subject: 'Re: commande',
        attachments: [],
        authentication: { spf: 'none', dkim: 'none', dmarc: 'none', dkimAligned: false },
        senderVerified: false,
        orderId: null,
        orderNumber: null,
      },
    });
    const text = host(fixture).querySelector('[data-text]');
    expect(text?.textContent).toBe(hostile);
    expect(text?.querySelector('script, a')).toBeNull();
    expect(host(fixture).querySelector('script')).toBeNull();
    expect(host(fixture).querySelector('a[href^="mailto:"]')).toBeNull();
    expect(host(fixture).querySelector('a[href*="evil"]')).toBeNull();
    expect(host(fixture).querySelector('a[data-company]')?.textContent).toContain('présumé');
    expect(host(fixture).textContent).toContain('Société présumée');
    expect(host(fixture).querySelector('app-email-reply-details [data-unverified]')).not.toBeNull();
    expect(host(fixture).querySelector('button[data-handle]')).not.toBeNull();
  });

  it('« Marquer traité » remonte à la boîte, sans rien écrire', async () => {
    const fixture = await mount(CONTACT);
    let asked = 0;
    fixture.componentInstance.handle.subscribe(() => (asked += 1));
    host(fixture).querySelector<HTMLButtonElement>('button[data-handle]')?.click();
    expect(asked).toBe(1);
  });
});
