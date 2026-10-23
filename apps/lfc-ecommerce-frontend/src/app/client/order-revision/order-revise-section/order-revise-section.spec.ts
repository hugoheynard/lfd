import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CustomerOrderDetailView } from '@lfd/contracts';
import type { OrderChangeRequestStatusView, OrderRevisability } from '@lfd/contracts/shop-values';
import { describe, expect, it } from 'vitest';

import { OrderRevisionGateway } from '../order-revision.gateway';
import { OrderReviseSection } from './order-revise-section';

/**
 * Le tiroir dit ce que le serveur a décidé (`revisability`, plan de
 * modification §6) : le bouton, la phrase du blocage, ou rien.
 */
async function mount(
  revisability: OrderRevisability | null,
  request: OrderChangeRequestStatusView | null = null,
): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OrderReviseSection],
    providers: [
      provideRouter([]),
      {
        provide: OrderRevisionGateway,
        useValue: {
          order: (): Promise<Pick<CustomerOrderDetailView, 'revisability'> | null> =>
            Promise.resolve(revisability === null ? null : { revisability }),
          changeRequest: (): Promise<OrderChangeRequestStatusView | null> =>
            Promise.resolve(request),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderReviseSection);
  fixture.componentRef.setInput('orderId', 'ord_9');
  fixture.detectChanges();
  // Deux lectures en parallèle : la commande et la dernière demande.
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('OrderReviseSection', () => {
  it('mène à l’écran de modification, avec l’heure limite', async () => {
    const el = await mount({ revisable: true, until: '2026-11-09T17:00:00.000Z' });
    const link = el.querySelector('[data-revise]');
    expect(link?.getAttribute('href')).toBe('/mes-commandes/modifier/ord_9');
    expect(link?.textContent).toContain('Modifier ma commande');
    expect(el.querySelector('[data-until]')?.textContent).toContain('09/11 à 18:00');
  });

  it('sans heure limite, le bouton seul', async () => {
    const el = await mount({ revisable: true, until: null });
    expect(el.querySelector('[data-revise]')).not.toBeNull();
    expect(el.querySelector('[data-until]')).toBeNull();
  });

  it('dit pourquoi une commande carte ne se modifie pas, sans bouton', async () => {
    const el = await mount({ revisable: false, code: 'card_settled', until: null });
    expect(el.querySelector('[data-revise]')).toBeNull();
    expect(el.querySelector('[data-refusal]')?.textContent).toContain('annulez-la et recommandez');
  });

  const TOO_LATE: OrderRevisability = {
    revisable: false,
    code: 'too_late',
    until: '2026-11-09T17:00:00.000Z',
  };
  const REQUEST: OrderChangeRequestStatusView = {
    id: 'cr_1',
    status: 'pending',
    requestedAt: '2026-11-09T18:00:00.000Z',
    answeredAt: null,
    refusalReason: null,
  };

  it('après l’heure limite : « Demander une modification », vers la même page', async () => {
    const el = await mount(TOO_LATE);
    expect(el.querySelector('[data-revise]')).toBeNull();
    const link = el.querySelector('[data-request-change]');
    expect(link?.getAttribute('href')).toBe('/mes-commandes/modifier/ord_9');
    expect(link?.textContent).toContain('Demander une modification');
    expect(el.querySelector('[data-request-note]')?.textContent).toContain('09/11 à 18:00');
  });

  it('une demande en attente : « en attente de notre réponse », sans second bouton', async () => {
    const el = await mount(TOO_LATE, REQUEST);
    expect(el.querySelector('[data-change-request]')?.textContent).toContain('en attente');
    expect(el.querySelector('[data-request-change]')).toBeNull();
  });

  it('une demande refusée : notre mot, et la possibilité d’en demander une autre', async () => {
    const el = await mount(TOO_LATE, {
      ...REQUEST,
      status: 'refused',
      answeredAt: '2026-11-09T19:00:00.000Z',
      refusalReason: 'La fournée est lancée.',
    });
    expect(el.querySelector('[data-change-request]')?.textContent).toContain(
      'La fournée est lancée.',
    );
    expect(el.querySelector('[data-request-change]')).not.toBeNull();
  });

  it('une demande appliquée se dit', async () => {
    const el = await mount(TOO_LATE, {
      ...REQUEST,
      status: 'applied',
      answeredAt: '2026-11-09T19:00:00.000Z',
    });
    expect(el.querySelector('[data-change-request]')?.textContent).toContain('acceptée');
  });

  it('se tait sur une commande annulée, et quand la lecture échoue', async () => {
    expect(
      (await mount({ revisable: false, code: 'cancelled', until: null })).textContent?.trim(),
    ).toBe('');
    expect((await mount(null)).textContent?.trim()).toBe('');
  });
});
