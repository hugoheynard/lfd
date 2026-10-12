import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { AdminOrderRefund, StaffPermission } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminOrdersService } from '../orders.service';
import { OrderRefundBanner } from './order-refund-banner';

const CAN: readonly StaffPermission[] = ['b2b_orders:read', 'b2b_cancel_order:write'];

/** Recopiés à l'écran, jamais comparés à l'horloge. */
const REFUND: AdminOrderRefund = {
  state: 'to_issue',
  announcedCents: 2_340,
  issuedCents: null,
  requestedAt: '2030-01-10T09:00:00.000Z',
  issuedAt: null,
  attempts: 0,
  lastFailure: null,
  retryable: true,
};

function mount(
  refund: AdminOrderRefund | null,
  permissions: readonly StaffPermission[] = CAN,
  answer: () => Promise<void> = async () => undefined,
) {
  const retryRefund = vi.fn(answer);
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminOrdersService, useValue: { retryRefund } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderRefundBanner);
  fixture.componentRef.setInput('orderId', 'ord_1');
  fixture.componentRef.setInput('refund', refund);
  const retried = vi.fn();
  fixture.componentInstance.retried.subscribe(retried);
  fixture.detectChanges();
  return { fixture, retryRefund, retried };
}

const el = (f: ComponentFixture<OrderRefundBanner>) => f.nativeElement as HTMLElement;
const text = (f: ComponentFixture<OrderRefundBanner>) =>
  (el(f).textContent ?? '').replace(/\s+/gu, ' ');
const button = (f: ComponentFixture<OrderRefundBanner>) =>
  el(f).querySelector<HTMLButtonElement>('[data-refund-retry]');

describe('le bandeau du remboursement (C4.9)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('rien sans demande', () => {
    const { fixture } = mount(null);

    expect(el(fixture).querySelector('[data-refund-banner]')).toBeNull();
  });

  it('demandé, pas encore parti : « en cours d’envoi », Relancer actif', () => {
    const { fixture } = mount(REFUND);

    expect(text(fixture)).toContain('en cours d');
    expect(button(fixture)?.disabled).toBe(false);
  });

  it('à faire après des essais : la phrase du serveur, en alerte', () => {
    const { fixture } = mount({
      ...REFUND,
      attempts: 3,
      lastFailure: 'Stripe n’a pas répondu (3 essais). Le système réessaie tout seul.',
    });

    expect(text(fixture)).toContain('à faire');
    expect(text(fixture)).toContain('Stripe n’a pas répondu (3 essais)');
    expect(el(fixture).querySelector('[data-refund-banner]')?.getAttribute('data-state')).toBe(
      'to_issue',
    );
  });

  it('envoyé à Stripe : en attente de la banque, sans bouton', () => {
    const { fixture } = mount({
      ...REFUND,
      state: 'issued',
      issuedCents: 2_340,
      issuedAt: '2030-01-10T09:03:00.000Z',
      retryable: false,
    });

    expect(text(fixture)).toContain('en attente de la banque');
    expect(button(fixture)).toBeNull();
  });

  it('remboursé : sans bouton', () => {
    const { fixture } = mount({
      ...REFUND,
      state: 'refunded',
      issuedCents: 2_340,
      retryable: false,
    });

    expect(text(fixture)).toContain('remboursé');
    expect(button(fixture)).toBeNull();
  });

  it('échoué : à faire, Relancer actif', () => {
    const { fixture } = mount({ ...REFUND, state: 'failed', lastFailure: 'La banque a refusé.' });

    expect(text(fixture)).toContain('La banque a refusé.');
    expect(button(fixture)?.disabled).toBe(false);
  });

  it('Relancer désactivé sans le droit', () => {
    const { fixture } = mount(REFUND, ['b2b_orders:read']);

    expect(button(fixture)?.disabled).toBe(true);
  });

  it('Relancer désactivé quand Stripe traite déjà', () => {
    const { fixture } = mount({ ...REFUND, retryable: false });

    expect(button(fixture)?.disabled).toBe(true);
  });

  it('Relancer : demande au serveur, puis fait relire', async () => {
    const { fixture, retryRefund, retried } = mount(REFUND);

    button(fixture)?.click();
    await fixture.whenStable();

    expect(retryRefund).toHaveBeenCalledWith('ord_1');
    expect(retried).toHaveBeenCalledTimes(1);
  });

  it('un refus du serveur se dit, avec sa phrase', async () => {
    const { fixture, retried } = mount(REFUND, CAN, () =>
      Promise.reject(
        new HttpErrorResponse({
          status: 409,
          error: {
            code: 'orders.refund_request.in_progress',
            message: 'Stripe traite déjà ce remboursement.',
          },
        }),
      ),
    );

    button(fixture)?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el(fixture).querySelector('[data-refund-error]')?.textContent).toContain(
      'Stripe traite déjà ce remboursement.',
    );
    expect(retried).not.toHaveBeenCalled();
  });
});
