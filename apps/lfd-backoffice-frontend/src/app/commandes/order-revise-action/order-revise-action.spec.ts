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

  it('bloquée seule : aucun bouton grisé, la raison du serveur en callout', () => {
    const f = mount(CARD, CANCEL_OPEN, ['b2b_place_order:write', 'b2b_cancel_order:write']);
    expect(el(f).querySelector('[data-revise-trigger]')).toBeNull();
    expect(el(f).querySelector('button[disabled]')).toBeNull();
    expect(el(f).querySelector('fold-callout[data-revise-blocked]')?.textContent).toContain(
      'réglée par carte',
    );
  });

  it('ni modifiable ni annulable : une seule ligne discrète, la raison servie telle quelle', () => {
    const f = mount(INSCRIBED, CANCEL_CLOSED, ['b2b_place_order:write', 'b2b_cancel_order:write']);
    expect(el(f).querySelector('[data-revise-trigger]')).toBeNull();
    expect(el(f).querySelector('fold-callout')).toBeNull();
    expect(el(f).querySelectorAll('[data-revise-blocked]')).toHaveLength(1);
    expect(el(f).querySelector('p[data-revise-blocked]')?.textContent?.trim()).toBe(
      INSCRIBED.revisable ? '' : INSCRIBED.reason,
    );
  });

  it('plan A2 : inscrite au plan, le bouton dit « Modifier les quantités »', () => {
    const f = mount(
      { revisable: true, quantitiesOnly: 'Seules les quantités changent.' },
      CANCEL_CLOSED,
      ['b2b_place_order:write'],
    );
    expect(el(f).querySelector('[data-revise-trigger]')?.textContent?.trim()).toBe(
      'Modifier les quantités',
    );
  });
});
