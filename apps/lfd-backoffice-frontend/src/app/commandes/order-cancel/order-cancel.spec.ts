import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { AdminOrderCancellability, StaffPermission } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminOrdersService } from '../orders.service';
import { OrderCancelComponent } from './order-cancel';

const CAN: readonly StaffPermission[] = ['b2b_orders:read', 'b2b_cancel_order:write'];

interface Harness {
  readonly fixture: ComponentFixture<OrderCancelComponent>;
  readonly cancel: ReturnType<typeof vi.fn>;
  readonly done: ReturnType<typeof vi.fn>;
}

function mount(
  cancellability: AdminOrderCancellability,
  permissions: readonly StaffPermission[] = CAN,
  answer: () => Promise<void> = async () => undefined,
): Harness {
  const cancel = vi.fn(answer);
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminOrdersService, useValue: { cancel } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderCancelComponent);
  fixture.componentRef.setInput('orderId', 'ord_1');
  fixture.componentRef.setInput('cancellability', cancellability);
  const done = vi.fn();
  fixture.componentInstance.cancelled.subscribe(done);
  fixture.detectChanges();
  return { fixture, cancel, done };
}

const el = (f: ComponentFixture<OrderCancelComponent>) => f.nativeElement as HTMLElement;
const text = (f: ComponentFixture<OrderCancelComponent>) =>
  (el(f).textContent ?? '').replace(/\s+/gu, ' ');

/** Ouvre la confirmation et saisit le motif, comme le ferait le staff. */
function openWith(f: ComponentFixture<OrderCancelComponent>, reason: string): void {
  f.componentInstance['onOpenChange'](true);
  f.componentInstance['reason'].set(reason);
  f.detectChanges();
}

function httpError(status: number, code: string, message: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message } });
}

describe('annuler une commande depuis son détail staff', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('n’existe pas sans `b2b_cancel_order:write`', () => {
    const { fixture } = mount({ cancellable: true, voucher: null }, ['b2b_orders:read']);

    expect(el(fixture).querySelector('[data-cancel-trigger]')).toBeNull();
  });

  it('est désactivé avec la raison du serveur à l’écran', () => {
    const reason = 'La commande est déjà au compte à produire.';
    const { fixture } = mount({ cancellable: false, reason });

    const trigger = el(fixture).querySelector<HTMLButtonElement>('[data-cancel-trigger]');
    expect(trigger?.disabled).toBe(true);
    expect(el(fixture).querySelector('[data-cancel-blocked]')?.textContent).toContain(reason);
  });

  it('est actif quand la commande s’annule, et le motif ne s’ouvre qu’avec la confirmation', () => {
    const { fixture } = mount({ cancellable: true, voucher: null });

    const trigger = el(fixture).querySelector<HTMLButtonElement>('[data-cancel-trigger]');
    expect(trigger?.disabled).toBe(false);
    expect(el(fixture).querySelector('[data-cancel-reason]')).toBeNull();

    openWith(fixture, '');
    expect(el(fixture).querySelector('[data-cancel-reason]')).not.toBeNull();
  });

  it('dit, dans la confirmation, ce que deviendra le bon de fidélité (C3b)', () => {
    const sentence =
      'Le bon de fidélité de 12,00 € utilisé sur cette commande sera rendu au client, valable jusqu’au 30/11.';
    const { fixture } = mount({
      cancellable: true,
      voucher: {
        outcome: 'returned',
        voucherValueCents: 1_200,
        expiresAt: '2030-11-30T12:00:00.000Z',
        sentence,
      },
    });
    expect(el(fixture).querySelector('[data-cancel-voucher]')).toBeNull();

    openWith(fixture, '');
    expect(el(fixture).querySelector('[data-cancel-voucher]')?.textContent?.trim()).toBe(sentence);
  });

  it('refuse de confirmer sans motif, et le dit', async () => {
    const { fixture, cancel } = mount({ cancellable: true, voucher: null });
    openWith(fixture, '   ');

    await fixture.componentInstance['confirm']();
    fixture.detectChanges();

    expect(cancel).not.toHaveBeenCalled();
    expect(fixture.componentInstance['missing']()).toBe(true);
  });

  it('refuse un motif de plus de 500 caractères sans appeler le serveur', async () => {
    const { fixture, cancel } = mount({ cancellable: true, voucher: null });
    openWith(fixture, 'x'.repeat(501));

    await fixture.componentInstance['confirm']();

    expect(cancel).not.toHaveBeenCalled();
  });

  it('envoie le motif nettoyé, referme, et demande la relecture', async () => {
    const { fixture, cancel, done } = mount({ cancellable: true, voucher: null });
    openWith(fixture, '  Commande passée en double  ');

    await fixture.componentInstance['confirm']();

    expect(cancel).toHaveBeenCalledWith('ord_1', { reason: 'Commande passée en double' });
    expect(done).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance['open']()).toBe(false);
  });

  it('affiche telle quelle la phrase d’un refus 409', async () => {
    const sentence = 'Cette commande est déjà annulée.';
    const { fixture, done } = mount({ cancellable: true, voucher: null }, CAN, async () => {
      throw httpError(409, 'orders.cancel.already_cancelled', sentence);
    });
    openWith(fixture, 'Doublon');

    await fixture.componentInstance['confirm']();
    fixture.detectChanges();

    expect(done).not.toHaveBeenCalled();
    expect(el(fixture).querySelector('[data-cancel-error]')?.textContent).toContain(sentence);
  });

  it('dit d’après le CODE le 500 `not_recorded`, dont le message serveur est masqué', async () => {
    const { fixture } = mount({ cancellable: true, voucher: null }, CAN, async () => {
      throw httpError(500, 'orders.cancel.not_recorded', 'Une erreur interne est survenue.');
    });
    openWith(fixture, 'Doublon');

    await fixture.componentInstance['confirm']();
    fixture.detectChanges();

    expect(text(fixture)).toContain(
      "Le paiement a été fermé chez Stripe mais l'annulation n'a pas pu être enregistrée. Relancez l'annulation.",
    );
    expect(text(fixture)).not.toContain('Une erreur interne');
  });
});
