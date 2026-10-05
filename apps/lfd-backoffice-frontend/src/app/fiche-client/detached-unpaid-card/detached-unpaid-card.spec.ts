import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { DetachedUnpaidOrderView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DetachedUnpaidService } from '../facturation/detached-unpaid.service';
import { DetachedUnpaidCard } from './detached-unpaid-card';

/** Des dates seulement affichées : aucune n'est comparée à l'horloge. */
const ORDER: DetachedUnpaidOrderView = {
  orderId: 'o1',
  orderNumber: 'CMD-1',
  placedAt: '2026-09-12T08:00:00.000Z',
  totalCents: 12_000,
  site: { id: 'site_1', enseigne: 'Chalet Edelweiss' },
  payer: { id: 'p1', enseigne: 'Alpes Chalets' },
  excludedAt: '2026-10-01T08:00:00.000Z',
};

async function boot(
  read: () => Promise<{ orders: readonly DetachedUnpaidOrderView[] }>,
): Promise<ComponentFixture<DetachedUnpaidCard>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: DetachedUnpaidService, useValue: { ofCompany: read } },
    ],
  });
  const fixture = TestBed.createComponent(DetachedUnpaidCard);
  fixture.componentRef.setInput('companyId', 'p1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('DetachedUnpaidCard', () => {
  it('ne montre rien quand aucune commande ne reste à régler', async () => {
    const host = (await boot(() => Promise.resolve({ orders: [] }))).nativeElement as HTMLElement;
    expect(host.querySelector('[data-detached-unpaid]')).toBeNull();
    expect(host.querySelector('[data-detached-unpaid-error]')).toBeNull();
  });

  it('liste les commandes, leur total, un lien vers chacune, et dit qu’elles ne seront pas prélevées', async () => {
    const orders = [ORDER, { ...ORDER, orderId: 'o2', orderNumber: 'CMD-2', totalCents: 3_000 }];
    const host = (await boot(() => Promise.resolve({ orders }))).nativeElement as HTMLElement;
    const card = host.querySelector('[data-detached-unpaid]');
    expect(card?.textContent).toContain('ne seront pas prélevées sur le compte du principal');
    expect(card?.textContent).toContain('lien de paiement ou à la main');
    expect(host.querySelector('[data-detached-unpaid-order="o1"] a')?.getAttribute('href')).toBe(
      '/comptes-clients/site_1/commandes/o1',
    );
    expect(host.querySelector('[data-detached-unpaid-total]')?.textContent).toMatch(/150,00/);
  });

  it('dit l’échec de lecture sans inventer une liste vide', async () => {
    const host = (await boot(() => Promise.reject(new Error('réseau'))))
      .nativeElement as HTMLElement;
    expect(host.querySelector('[data-detached-unpaid-error]')).not.toBeNull();
    expect(host.querySelector('[data-detached-unpaid]')).toBeNull();
  });
});
