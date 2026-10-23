import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  AdminOrderCancellability,
  AdminOrderRevisability,
  StaffPermission,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { OrderReviseAction } from './order-revise-action';

const CANCEL_OPEN: AdminOrderCancellability = { cancellable: true, voucher: null, refund: null };
const CANCEL_CLOSED: AdminOrderCancellability = {
  cancellable: false,
  reason: 'La commande est au compte à produire.',
};
const OPEN: AdminOrderRevisability = { revisable: true };
const INSCRIBED: AdminOrderRevisability = {
  revisable: false,
  reason: 'Le fournil a déjà inscrit cette commande au compte à produire.',
};
const CARD: AdminOrderRevisability = {
  revisable: false,
  reason: 'Commande réglée par carte : annulez-la et recommandez, ou demandez au commerce.',
};

function mount(
  revisability: AdminOrderRevisability,
  cancellability: AdminOrderCancellability,
  permissions: readonly StaffPermission[],
): ComponentFixture<OrderReviseAction> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderReviseAction);
  fixture.componentRef.setInput('orderId', 'ord_1');
  fixture.componentRef.setInput('revisability', revisability);
  fixture.componentRef.setInput('cancellability', cancellability);
  fixture.detectChanges();
  return fixture;
}

const el = (f: ComponentFixture<OrderReviseAction>) => f.nativeElement as HTMLElement;

describe('le bouton « Modifier la commande »', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('est absent sans le droit de saisir une commande', () => {
    const f = mount(OPEN, CANCEL_OPEN, ['b2b_orders:read']);
    expect(el(f).querySelector('[data-revise-trigger]')).toBeNull();
  });

  it('mène à la modification quand le serveur la dit possible', () => {
    const f = mount(OPEN, CANCEL_OPEN, ['b2b_place_order:write']);
    const link = el(f).querySelector('a[data-revise-trigger]');
    expect(link?.getAttribute('href')).toBe('/commandes/ord_1/modifier');
  });

  it('est grisé avec la raison du serveur — une commande carte s’annule mais ne se modifie pas', () => {
    const f = mount(CARD, CANCEL_OPEN, ['b2b_place_order:write', 'b2b_cancel_order:write']);
    expect(el(f).querySelector('button[data-revise-trigger]')?.hasAttribute('disabled')).toBe(true);
    expect(el(f).querySelector('[data-revise-blocked]')?.textContent).toContain('réglée par carte');
  });

  it("dit la raison quand le bouton d'annulation n'est pas là pour la dire", () => {
    const f = mount(INSCRIBED, CANCEL_CLOSED, ['b2b_place_order:write']);
    expect(el(f).querySelector('[data-revise-blocked]')?.textContent).toContain(
      'compte à produire',
    );
  });

  it("ne répète pas la cause commune que le bouton d'annulation écrit déjà", () => {
    const f = mount(INSCRIBED, CANCEL_CLOSED, ['b2b_place_order:write', 'b2b_cancel_order:write']);
    expect(el(f).querySelector('button[data-revise-trigger]')?.hasAttribute('disabled')).toBe(true);
    expect(el(f).querySelector('[data-revise-blocked]')).toBeNull();
  });
});
