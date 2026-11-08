import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { OrderMailView, OrderMailsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { OrderMailsStore } from '../order-mails.store';
import { AdminOrdersService } from '../orders.service';
import { OrderMailsCard } from './order-mails-card';

/** Des dates seulement affichées : aucune n'est comparée à l'horloge. */
const READY: OrderMailView = {
  id: 'ms_2',
  template: 'customer.order-ready',
  requestedAt: '2030-01-10T09:00:00.000Z',
  state: 'accepted',
  delivery: 'bounced',
  deliveryAt: '2030-01-10T09:01:00.000Z',
};
const PLACED: OrderMailView = {
  id: 'ms_1',
  template: 'customer.order-placed',
  requestedAt: '2030-01-09T09:00:00.000Z',
  state: 'accepted',
  delivery: 'delivered',
  deliveryAt: '2030-01-09T09:01:00.000Z',
};

async function boot(
  read: () => Promise<OrderMailsView>,
  canOpenSends = true,
): Promise<{ fixture: ComponentFixture<OrderMailsCard>; asked: string[] }> {
  const asked: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      OrderMailsStore,
      {
        provide: AdminOrdersService,
        useValue: {
          mails: (orderId: string) => {
            asked.push(orderId);
            return read();
          },
        } satisfies Pick<AdminOrdersService, 'mails'>,
      },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: string) => canOpenSends || permission !== 'mail_sends:read',
        } satisfies Pick<PermissionsStore, 'can'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderMailsCard);
  fixture.componentRef.setInput('orderId', 'o_1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, asked };
}

const el = (fixture: ComponentFixture<OrderMailsCard>) => fixture.nativeElement as HTMLElement;

describe('OrderMailsCard', () => {
  it('liste les e-mails dans l’ordre servi, chacun par son intitulé et son état en toutes lettres', async () => {
    const { fixture, asked } = await boot(() => Promise.resolve({ items: [READY, PLACED] }));
    const rows = el(fixture).querySelectorAll('[data-order-mail]');
    expect(asked).toEqual(['o_1']);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('Commande prête');
    expect(rows[0]?.textContent).toContain('Accepté par Resend · Rebondi');
    expect(rows[1]?.textContent).toContain('Commande passée');
    expect(rows[1]?.textContent).toContain('Remis');
  });

  it('dit en phrase qu’une adresse a été rejetée, et seulement là', async () => {
    const { fixture } = await boot(() => Promise.resolve({ items: [READY, PLACED] }));
    const rows = el(fixture).querySelectorAll('[data-order-mail]');
    expect(rows[0]?.querySelector('[data-order-mail-failure]')?.textContent).toContain(
      'Adresse rejetée : vérifiez l’adresse du client.',
    );
    expect(rows[1]?.querySelector('[data-order-mail-failure]')).toBeNull();
  });

  it('mène chaque ligne à son détail dans le suivi, pour qui a le droit', async () => {
    const { fixture } = await boot(() => Promise.resolve({ items: [READY] }));
    const link = el(fixture).querySelector('[data-order-mail-link]');
    expect(link?.getAttribute('href')).toBe('/emails/envois?envoi=ms_2');
  });

  it('ne met aucun lien sans `mail_sends:read`', async () => {
    const { fixture } = await boot(() => Promise.resolve({ items: [READY] }), false);
    expect(el(fixture).querySelector('[data-order-mail-link]')).toBeNull();
    expect(el(fixture).textContent).toContain('Commande prête');
  });

  it('dit honnêtement qu’aucun e-mail n’est suivi', async () => {
    const { fixture } = await boot(() => Promise.resolve({ items: [] }));
    expect(el(fixture).querySelector('[data-order-mails-empty]')).not.toBeNull();
  });

  it('dit un échec de lecture, et relit sur « Réessayer »', async () => {
    let fail = true;
    const { fixture, asked } = await boot(() =>
      fail ? Promise.reject(new Error('500')) : Promise.resolve({ items: [READY] }),
    );
    const error = el(fixture).querySelector('[data-order-mails-error]');
    expect(error).not.toBeNull();
    fail = false;
    error?.querySelector('button')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(asked).toEqual(['o_1', 'o_1']);
    expect(el(fixture).querySelectorAll('[data-order-mail]')).toHaveLength(1);
  });
});
