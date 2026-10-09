import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { OrderProblemDetailsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { CustomerRequestsService } from '../customer-requests.service';
import { OrderProblemDetails } from './order-problem-details';

/** Les détails d'un problème de commande : la commande liée, et les photos lues par la route admin. */

const DETAILS: OrderProblemDetailsView = {
  kind: 'order_problem',
  orderId: 'o_42',
  orderNumber: 'C-0042',
  photos: [
    { id: 'ph_b', position: 1 },
    { id: 'ph_a', position: 0 },
  ],
};

async function mount(
  details: OrderProblemDetailsView,
  fail = false,
): Promise<{ fixture: ComponentFixture<OrderProblemDetails>; asked: string[] }> {
  const asked: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OrderProblemDetails],
    providers: [
      provideRouter([]),
      {
        provide: CustomerRequestsService,
        useValue: {
          photo: (requestId: string, photoId: string) => {
            asked.push(`${requestId}/${photoId}`);
            return fail ? Promise.reject(new Error('403')) : Promise.resolve(new Blob(['x']));
          },
        } satisfies Pick<CustomerRequestsService, 'photo'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderProblemDetails);
  fixture.componentRef.setInput('requestId', 'cr_1');
  fixture.componentRef.setInput('details', details);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, asked };
}

const host = (fixture: ComponentFixture<OrderProblemDetails>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('OrderProblemDetails', () => {
  it('lie la commande du back-office par sa référence', async () => {
    const { fixture } = await mount(DETAILS);
    const link = host(fixture).querySelector<HTMLAnchorElement>('a[data-order-link]');
    expect(link?.textContent).toContain('C-0042');
    expect(link?.getAttribute('href')).toBe('/commandes/o_42');
  });

  it('lit chaque photo par la route admin, dans l’ordre, et en fait des vignettes', async () => {
    const { fixture, asked } = await mount(DETAILS);
    expect(asked).toEqual(['cr_1/ph_a', 'cr_1/ph_b']);
    expect(host(fixture).querySelectorAll('a[data-photo] img')).toHaveLength(2);
  });

  it('une photo illisible se dit, sans casser la commande', async () => {
    const { fixture } = await mount(DETAILS, true);
    expect(host(fixture).querySelector('[data-photos-error]')).not.toBeNull();
    expect(host(fixture).querySelector('a[data-order-link]')).not.toBeNull();
  });

  it('anonymisée : plus de commande liée', async () => {
    const { fixture } = await mount({ ...DETAILS, orderId: null, orderNumber: null, photos: [] });
    expect(host(fixture).querySelector('a[data-order-link]')).toBeNull();
    expect(host(fixture).textContent).toContain('Effacée à l');
  });
});
