import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { AdminOrderRow, AdminOrdersPage, AdminOrdersQuery } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { FROM_ORDER_LIST } from '../order-list-return';
import { AdminOrdersService } from '../orders.service';
import { OrdersListPage } from './orders-list-page';

/**
 * Ce que ces cas tiennent : l'URL est la SEULE source des filtres (un filtre
 * posé s'y écrit, une adresse partagée les rend), « Charger plus » renvoie le
 * curseur tel quel et ajoute sous ce qui est là, son échec n'efface rien, et
 * ouvrir une commande dit au détail qu'on vient d'ici.
 */

@Component({ template: '' })
class Blank {}

function row(id: string): AdminOrderRow {
  return {
    id,
    orderNumber: `CMD-${id}`,
    placedAt: '2026-10-12T08:00:00.000Z',
    status: 'placed',
    paymentStatus: 'paid',
    fulfillmentMethod: 'pickup',
    fulfillmentDay: '2026-10-14',
    clientele: 'pro',
    subtotalCents: 1000,
    vatCents: 55,
    totalCents: 1055,
    customerLabel: 'Café du Port',
    companyId: 'co_1',
    companyDisplayName: 'Café du Port',
    origin: 'self_service',
  };
}

class FakeOrders {
  readonly calls: Partial<AdminOrdersQuery>[] = [];
  readonly pages: (AdminOrdersPage | Error)[] = [];

  async list(filters: Partial<AdminOrdersQuery> = {}): Promise<AdminOrdersPage> {
    this.calls.push(filters);
    const next = this.pages.shift() ?? { rows: [], nextCursor: null };
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }
}

async function open(url: string, orders: FakeOrders) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'commandes', component: OrdersListPage },
          { path: 'commandes/:orderId', component: Blank },
        ],
        withComponentInputBinding(),
      ),
      { provide: AdminOrdersService, useValue: orders },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  await settle(harness);
  return harness;
}

async function settle(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    harness.detectChanges();
    await harness.fixture.whenStable();
  }
}

function emit(harness: RouterTestingHarness, filter: string, output: string, value: string): void {
  const control = harness.fixture.debugElement.query(By.css(`[data-filter="${filter}"]`));
  (control.componentInstance as Record<string, { emit(v: string): void }>)[output]!.emit(value);
}

function root(harness: RouterTestingHarness): HTMLElement {
  return harness.fixture.nativeElement as HTMLElement;
}

describe('OrdersListPage — la liste de toutes les commandes', () => {
  it("lit ses filtres dans l'adresse et les passe au serveur", async () => {
    const orders = new FakeOrders();
    await open('/commandes?clientele=pro&method=delivery&placedFrom=2026-10-01&q=port', orders);
    expect(orders.calls.at(-1)).toEqual({
      clientele: 'pro',
      method: 'delivery',
      placedFrom: '2026-10-01',
      q: 'port',
      limit: 50,
    });
  });

  it("jette une valeur inconnue au lieu de l'envoyer au serveur", async () => {
    const orders = new FakeOrders();
    await open('/commandes?status=nimporte&placedTo=hier', orders);
    expect(orders.calls.at(-1)).toEqual({ limit: 50 });
  });

  it("écrit un filtre posé dans l'adresse, et recharge", async () => {
    const orders = new FakeOrders();
    const harness = await open('/commandes?method=pickup', orders);
    emit(harness, 'clientele', 'selectionChange', 'public');
    await settle(harness);
    const url = TestBed.inject(Router).url;
    expect(url).toContain('clientele=public');
    expect(url).toContain('method=pickup');
    expect(orders.calls.at(-1)).toEqual({ clientele: 'public', method: 'pickup', limit: 50 });
  });

  it("« Tous » retire le filtre de l'adresse", async () => {
    const orders = new FakeOrders();
    const harness = await open('/commandes?clientele=pro', orders);
    emit(harness, 'clientele', 'selectionChange', 'any');
    await settle(harness);
    expect(TestBed.inject(Router).url).toBe('/commandes');
  });

  it("la recherche s'écrit en `q`, et un champ vidé la retire", async () => {
    const orders = new FakeOrders();
    const harness = await open('/commandes', orders);
    emit(harness, 'q', 'searchChange', 'léa martin');
    await settle(harness);
    expect(orders.calls.at(-1)).toEqual({ q: 'léa martin', limit: 50 });
    emit(harness, 'q', 'searchChange', '');
    await settle(harness);
    expect(TestBed.inject(Router).url).toBe('/commandes');
  });

  it('« Charger plus » renvoie le curseur avec les filtres, et ajoute sous la liste', async () => {
    const orders = new FakeOrders();
    orders.pages.push(
      { rows: [row('a')], nextCursor: 'c1' },
      { rows: [row('b')], nextCursor: null },
    );
    const harness = await open('/commandes?clientele=pro', orders);
    (root(harness).querySelector('[data-load-more]') as HTMLButtonElement).click();
    await settle(harness);
    expect(orders.calls.at(-1)).toEqual({ clientele: 'pro', cursor: 'c1', limit: 50 });
    expect(root(harness).textContent).toContain('CMD-a');
    expect(root(harness).textContent).toContain('CMD-b');
    expect(root(harness).querySelector('[data-load-more]')).toBeNull();
  });

  it('un « Charger plus » en échec laisse la liste et le dit dans un callout', async () => {
    const orders = new FakeOrders();
    orders.pages.push({ rows: [row('a')], nextCursor: 'c1' }, new Error('réseau'));
    const harness = await open('/commandes', orders);
    (root(harness).querySelector('[data-load-more]') as HTMLButtonElement).click();
    await settle(harness);
    expect(root(harness).textContent).toContain('CMD-a');
    expect(root(harness).querySelector('fold-callout[data-more-error]')).not.toBeNull();
  });

  it('un premier chargement en échec est un état vide en alerte, avec Réessayer', async () => {
    const orders = new FakeOrders();
    orders.pages.push(new Error('réseau'));
    const harness = await open('/commandes', orders);
    expect(root(harness).querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
  });

  it('ouvre une commande en disant au détail qu’on vient de la liste', async () => {
    const orders = new FakeOrders();
    orders.pages.push({ rows: [row('a')], nextCursor: null });
    const harness = await open('/commandes?clientele=pro', orders);
    const table = harness.fixture.debugElement.query(By.css('app-orders-table'));
    (table.componentInstance as { opened: { emit(r: AdminOrderRow): void } }).opened.emit(row('a'));
    await settle(harness);
    const router = TestBed.inject(Router);
    expect(router.url).toBe('/commandes/a');
    expect(router.lastSuccessfulNavigation()?.extras.state).toEqual({ [FROM_ORDER_LIST]: true });
  });
});
