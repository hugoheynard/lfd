import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { OrderAwaitingPaymentView, StaffPermission } from '@lfd/contracts';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { PaymentLinksService } from '../../payment-links.service';
import { OrdersToSettle } from './orders-to-settle';

/**
 * Ce que ces cas tiennent : chaque colonne rend quelque chose, une commande
 * sans lien le DIT au lieu d'offrir un geste voué au refus, le renvoi demande
 * le droit d'écriture, et un refus s'affiche avec les mots du serveur.
 */

function order(over: Partial<OrderAwaitingPaymentView> = {}): OrderAwaitingPaymentView {
  return {
    orderId: 'o1',
    reference: 'CMD-0042',
    companyId: 'c1',
    companyName: 'Le Lac',
    totalCents: 4_590,
    placedAt: '2026-09-20T09:00:00.000Z',
    status: 'confirmed',
    paymentStatus: 'failed',
    paymentUrl: 'https://client.example/commandes/o1/regler',
    ...over,
  };
}

class FakeApi {
  rows: readonly OrderAwaitingPaymentView[] = [
    order(),
    order({ orderId: 'o2', reference: 'CMD-0043', paymentStatus: 'pending', paymentUrl: null }),
  ];
  resent: string[] = [];
  refuse: unknown = null;

  listOrders(): Promise<readonly OrderAwaitingPaymentView[]> {
    return Promise.resolve(this.rows);
  }

  resendOrderLink(orderId: string): Promise<void> {
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.resent.push(orderId);
    return Promise.resolve();
  }
}

async function render(
  api: FakeApi,
  permissions: readonly StaffPermission[] = ['b2b_accounting:read', 'b2b_accounting:write'],
): Promise<ComponentFixture<OrdersToSettle>> {
  TestBed.configureTestingModule({
    imports: [OrdersToSettle],
    providers: [
      { provide: PaymentLinksService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(OrdersToSettle);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<OrdersToSettle>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

const text = (fixture: ComponentFixture<OrdersToSettle>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function buttons(fixture: ComponentFixture<OrdersToSettle>, label: string): HTMLElement[] {
  const all = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('button');
  return Array.from(all).filter((b) => b.textContent?.trim() === label);
}

describe('OrdersToSettle', () => {
  it('rend société, numéro, montant et statut du règlement', async () => {
    const body = text(await render(new FakeApi()));

    expect(body).toContain('Le Lac');
    expect(body).toContain('CMD-0042');
    expect(body).toMatch(/45,90\s€/u);
    expect(body).toContain('Refusé');
    expect(body).toContain('En attente');
  });

  it('une commande sans lien le dit, et n’offre ni copie ni renvoi', async () => {
    const fixture = await render(new FakeApi());

    expect(text(fixture)).toContain("l'adresse publique de l'espace client n'est pas configurée");
    expect(buttons(fixture, 'Copier le lien')).toHaveLength(1);
    expect(buttons(fixture, 'Renvoyer par e-mail')).toHaveLength(1);
  });

  it('sans droit d’écriture, copier reste, renvoyer disparaît', async () => {
    const fixture = await render(new FakeApi(), ['b2b_accounting:read']);

    expect(buttons(fixture, 'Copier le lien')).toHaveLength(1);
    expect(buttons(fixture, 'Renvoyer par e-mail')).toHaveLength(0);
  });

  it('« Renvoyer par e-mail » vise la commande de la ligne', async () => {
    const api = new FakeApi();
    const fixture = await render(api);

    buttons(fixture, 'Renvoyer par e-mail')[0]?.click();
    await settle(fixture);

    expect(api.resent).toEqual(['o1']);
  });

  it('un refus du serveur s’affiche avec ses mots, la liste reste', async () => {
    const api = new FakeApi();
    api.refuse = { status: 409, error: { message: "L'acheteur n'a pas d'adresse e-mail." } };
    const fixture = await render(api);

    buttons(fixture, 'Renvoyer par e-mail')[0]?.click();
    await settle(fixture);

    expect(text(fixture)).toContain("L'acheteur n'a pas d'adresse e-mail.");
    expect(text(fixture)).toContain('CMD-0042');
  });

  it('aucune commande à régler : l’état vide fold', async () => {
    const api = new FakeApi();
    api.rows = [];
    expect(text(await render(api))).toContain('Aucune commande à régler');
  });
});
