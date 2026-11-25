import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AdminBackorderView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminBackordersService } from '../backorders.service';
import { OrderBackorderCard } from './order-backorder-card';

const ALL: readonly StaffPermission[] = [
  'b2b_orders:read',
  'b2b_place_order:write',
  'b2b_orders_shortfall:write',
];

/** Recopiées à l'écran, jamais comparées à l'horloge. */
const OPEN: AdminBackorderView = {
  id: 'bo_1',
  state: 'open',
  createdAt: '2030-01-10T09:15:00.000Z',
  origin: { orderId: 'ord_1', orderNumber: 'ORD-0042' },
  company: { id: 'co_1', name: 'Café du Port' },
  buyer: { userId: 'u_1', name: 'Léa Martin' },
  lines: [{ sku: 'CRO', productName: 'Croissant', quantity: 3, saleUnit: 'piece' }],
  convertedOrder: null,
  closedAt: null,
};

function mount(
  backorder: AdminBackorderView | null,
  permissions: readonly StaffPermission[] = ALL,
  abandonAnswer: () => Promise<void> = async () => undefined,
) {
  TestBed.resetTestingModule();
  const abandon = vi.fn(abandonAnswer);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AdminBackordersService, useValue: { abandon } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderBackorderCard);
  fixture.componentRef.setInput('backorder', backorder);
  const changed = vi.fn();
  fixture.componentInstance.changed.subscribe(changed);
  fixture.detectChanges();
  return { fixture, abandon, changed };
}

type Fixture = ComponentFixture<OrderBackorderCard>;
const el = (f: Fixture) => f.nativeElement as HTMLElement;
const text = (f: Fixture) => (el(f).textContent ?? '').replace(/\s+/gu, ' ');

async function confirmAbandon(f: Fixture): Promise<void> {
  el(f).querySelector<HTMLButtonElement>('[data-backorder-abandon]')?.click();
  f.detectChanges();
  const confirm = [...el(f).querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    (button.textContent ?? '').includes('Abandonner le reliquat'),
  );
  confirm?.click();
  await f.whenStable();
  f.detectChanges();
}

describe('OrderBackorderCard — le reliquat sur la fiche d’origine', () => {
  it('ne montre rien sans reliquat', () => {
    const { fixture } = mount(null);
    expect(el(fixture).querySelector('[data-backorder]')).toBeNull();
  });

  it('dit le reliquat ouvert et ses lignes', () => {
    const { fixture } = mount(OPEN);
    expect(el(fixture).querySelector('[data-backorder]')?.getAttribute('data-state')).toBe('open');
    expect(text(fixture)).toContain('Reliquat à traiter');
    expect(text(fixture)).toContain('3 × Croissant');
  });

  it('« Transformer » mène à la saisie garnie du reliquat, depuis l’origine', () => {
    const { fixture } = mount(OPEN);
    const link = el(fixture).querySelector<HTMLAnchorElement>('[data-backorder-convert]');
    expect(link?.getAttribute('href')).toBe('/commandes/ord_1/reliquat');
  });

  it('ne propose pas « Transformer » à un particulier, ni sans le droit de passer', () => {
    expect(
      el(mount({ ...OPEN, company: null }).fixture).querySelector('[data-backorder-convert]'),
    ).toBeNull();
    const withoutPlace = mount(OPEN, ['b2b_orders:read', 'b2b_orders_shortfall:write']);
    expect(el(withoutPlace.fixture).querySelector('[data-backorder-convert]')).toBeNull();
    expect(el(withoutPlace.fixture).querySelector('[data-backorder-abandon]')).not.toBeNull();
  });

  it('n’abandonne qu’après confirmation, puis fait relire la fiche', async () => {
    const { fixture, abandon, changed } = mount(OPEN);
    el(fixture).querySelector<HTMLButtonElement>('[data-backorder-abandon]')?.click();
    fixture.detectChanges();
    expect(abandon).not.toHaveBeenCalled();
    expect(text(fixture)).toContain('Le geste est définitif');

    const confirm = [...el(fixture).querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      (b.textContent ?? '').includes('Abandonner le reliquat'),
    );
    confirm?.click();
    await fixture.whenStable();
    expect(abandon).toHaveBeenCalledWith('bo_1');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('dit le refus du serveur (déjà fermé) sans faire relire', async () => {
    const refusal = new HttpErrorResponse({
      status: 409,
      error: { code: 'orders.backorder.closed', message: 'Ce reliquat est déjà abandonné.' },
    });
    const { fixture, changed } = mount(OPEN, ALL, () => Promise.reject(refusal));
    await confirmAbandon(fixture);
    expect(el(fixture).querySelector('[data-backorder-error]')?.textContent).toContain(
      'Ce reliquat est déjà abandonné.',
    );
    expect(changed).not.toHaveBeenCalled();
  });

  it('sans le droit de la décision du départ, pas d’« Abandonner »', () => {
    const { fixture } = mount(OPEN, ['b2b_orders:read', 'b2b_place_order:write']);
    expect(el(fixture).querySelector('[data-backorder-abandon]')).toBeNull();
  });

  it('transformé : plus aucun geste, et le lien vers la commande issue', () => {
    const { fixture } = mount({
      ...OPEN,
      state: 'converted',
      convertedOrder: { orderId: 'ord_2', orderNumber: 'ORD-0099' },
      closedAt: '2030-01-11T10:00:00.000Z',
    });
    const issued = el(fixture).querySelector<HTMLAnchorElement>('[data-backorder-issued]');
    expect(issued?.textContent).toContain('ORD-0099');
    expect(issued?.getAttribute('href')).toBe('/commandes/ord_2');
    expect(el(fixture).querySelector('[data-backorder-convert]')).toBeNull();
    expect(el(fixture).querySelector('[data-backorder-abandon]')).toBeNull();
  });

  it('abandonné : le dit, sans geste', () => {
    const { fixture } = mount({
      ...OPEN,
      state: 'abandoned',
      closedAt: '2030-01-11T10:00:00.000Z',
    });
    expect(text(fixture)).toContain('Reliquat abandonné');
    expect(el(fixture).querySelector('[data-backorder-abandon]')).toBeNull();
  });
});

describe('OrderBackorderCard — le reliquat d’un particulier (décision 13)', () => {
  const PARTICULAR: AdminBackorderView = { ...OPEN, company: null };
  const WITH_OFFER: readonly StaffPermission[] = [...ALL, 'b2b_offer_order:write'];

  it('propose « Réglée en boutique », « Offerte » et « Abandonner », jamais « Transformer »', () => {
    const { fixture } = mount(PARTICULAR, WITH_OFFER);
    const shop = el(fixture).querySelector<HTMLAnchorElement>('[data-backorder-shop-till]');
    const offered = el(fixture).querySelector<HTMLAnchorElement>('[data-backorder-offered]');
    expect(shop?.getAttribute('href')).toBe('/commandes/ord_1/reliquat-particulier');
    expect(offered?.getAttribute('href')).toBe(
      '/commandes/ord_1/reliquat-particulier?venue=offered',
    );
    expect(el(fixture).querySelector('[data-backorder-abandon]')).not.toBeNull();
    expect(el(fixture).querySelector('[data-backorder-convert]')).toBeNull();
  });

  it('sans le droit d’offrir, pas d’« Offerte » ; sans celui de passer, ni l’un ni l’autre', () => {
    const noOffer = mount(PARTICULAR, ALL);
    expect(el(noOffer.fixture).querySelector('[data-backorder-shop-till]')).not.toBeNull();
    expect(el(noOffer.fixture).querySelector('[data-backorder-offered]')).toBeNull();

    const noPlace = mount(PARTICULAR, [
      'b2b_orders:read',
      'b2b_orders_shortfall:write',
      'b2b_offer_order:write',
    ]);
    expect(el(noPlace.fixture).querySelector('[data-backorder-shop-till]')).toBeNull();
    expect(el(noPlace.fixture).querySelector('[data-backorder-offered]')).toBeNull();
    expect(el(noPlace.fixture).querySelector('[data-backorder-abandon]')).not.toBeNull();
  });

  it('les gestes d’un particulier ne paraissent pas sur un pro', () => {
    const { fixture } = mount(OPEN, WITH_OFFER);
    expect(el(fixture).querySelector('[data-backorder-shop-till]')).toBeNull();
    expect(el(fixture).querySelector('[data-backorder-offered]')).toBeNull();
  });

  it('fermé : plus aucun geste du particulier', () => {
    const { fixture } = mount(
      { ...PARTICULAR, state: 'abandoned', closedAt: '2030-01-11T10:00:00.000Z' },
      WITH_OFFER,
    );
    expect(el(fixture).querySelector('[data-backorder-shop-till]')).toBeNull();
    expect(el(fixture).querySelector('[data-backorder-offered]')).toBeNull();
  });
});
