import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ActivityEventView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AdminOrdersService } from '../orders.service';
import { OrderHistoryCard } from './order-history-card';

/** Des dates seulement affichées : aucune n'est comparée à l'horloge. */
const PLACED: ActivityEventView = {
  id: 'evt_1',
  type: 'order.placed',
  module: 'commandes',
  occurredAt: '2026-09-21T10:00:00.000Z',
  subjectType: 'user',
  subjectId: 'usr_1',
  actorType: 'staff',
  actorId: 'stf_1',
  actorName: 'Hugo Heynard',
  actorRole: 'Commercial',
  traceId: 'trace',
  payload: { orderId: 'o_1', orderNumber: 'ORD-142' },
};
const READY: ActivityEventView = { ...PLACED, id: 'evt_2', type: 'order.ready' };

async function boot(
  read: () => Promise<readonly ActivityEventView[]>,
): Promise<{ fixture: ComponentFixture<OrderHistoryCard>; asked: string[] }> {
  const asked: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AdminOrdersService,
        useValue: {
          history: (orderId: string) => {
            asked.push(orderId);
            return read();
          },
        } satisfies Pick<AdminOrdersService, 'history'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderHistoryCard);
  fixture.componentRef.setInput('orderId', 'o_1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, asked };
}

describe('OrderHistoryCard', () => {
  it('rend une ligne par fait, avec la date et son auteur', async () => {
    const { fixture, asked } = await boot(() => Promise.resolve([READY, PLACED]));
    const element = fixture.nativeElement as HTMLElement;

    expect(asked).toEqual(['o_1']);
    const rows = element.querySelectorAll('[data-order-history-line]');
    expect(rows).toHaveLength(2);
    expect(rows[1]?.textContent).toContain('2026');
    expect(rows[1]?.textContent).toContain('Hugo Heynard');
    expect(rows[1]?.textContent).toContain('order.placed');
  });

  it('dit qu’aucun fait n’est enregistré', async () => {
    const { fixture } = await boot(() => Promise.resolve([]));
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-order-history-empty]')).not.toBeNull();
    expect(element.textContent).toContain('Aucun fait enregistré pour cette commande.');
  });

  it('dit un échec de lecture dans la carte, et propose de réessayer', async () => {
    let fail = true;
    const { fixture } = await boot(() =>
      fail ? Promise.reject(new Error('500')) : Promise.resolve([PLACED]),
    );
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-order-history-error]')).not.toBeNull();

    fail = false;
    element.querySelector<HTMLButtonElement>('[data-order-history-error] button')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelectorAll('[data-order-history-line]')).toHaveLength(1);
  });
});
