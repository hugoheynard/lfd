import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { AdminRefundRequest, StaffPermission } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminOrdersService } from '../orders.service';
import { OrderRefundBanner } from './order-refund-banner';

const CAN: readonly StaffPermission[] = ['b2b_orders:read', 'card_payments:write'];

/** Recopiés à l'écran, jamais comparés à l'horloge. */
const REQUEST: AdminRefundRequest = {
  id: 'rrq_1',
  paymentId: 'pay_1',
  form: 'remainder',
  nature: 'return',
  reason: 'cancellation',
  state: 'to_issue',
  announcedCents: 2_340,
  issuedCents: null,
  requestedAt: '2030-01-10T09:00:00.000Z',
  issuedAt: null,
  attempts: 0,
  generation: 1,
  lastFailure: null,
  retryable: false,
};

const STOPPED: AdminRefundRequest = {
  ...REQUEST,
  id: 'rrq_2',
  paymentId: 'pay_2',
  reason: 'paid_after_cancellation',
  state: 'stopped',
  announcedCents: 1_000,
  attempts: 1,
  lastFailure: 'La banque a refusé le remboursement chez Stripe.',
  retryable: true,
};

interface Answers {
  readonly retry?: () => Promise<void>;
  readonly settle?: () => Promise<void>;
}

function mount(
  requests: readonly AdminRefundRequest[],
  permissions: readonly StaffPermission[] = CAN,
  answers: Answers = {},
) {
  const retryRefund = vi.fn(answers.retry ?? (async () => undefined));
  const settleRefundElsewhere = vi.fn(answers.settle ?? (async () => undefined));
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminOrdersService, useValue: { retryRefund, settleRefundElsewhere } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderRefundBanner);
  fixture.componentRef.setInput('requests', requests);
  const changed = vi.fn();
  fixture.componentInstance.changed.subscribe(changed);
  fixture.detectChanges();
  return { fixture, retryRefund, settleRefundElsewhere, changed };
}

const el = (f: ComponentFixture<OrderRefundBanner>) => f.nativeElement as HTMLElement;
const text = (node: Element | null | undefined) => (node?.textContent ?? '').replace(/\s+/gu, ' ');
const line = (f: ComponentFixture<OrderRefundBanner>, id: string) =>
  el(f).querySelector<HTMLElement>(`[data-refund-banner][data-request="${id}"]`);
const retryButton = (f: ComponentFixture<OrderRefundBanner>, id: string) =>
  line(f, id)?.querySelector<HTMLButtonElement>('[data-refund-retry]') ?? null;
const settleButton = (f: ComponentFixture<OrderRefundBanner>, id: string) =>
  line(f, id)?.querySelector<HTMLButtonElement>('[data-refund-settle]') ?? null;

/** Ouvre « rendu autrement », écrit le motif, et confirme. */
async function settle(f: ComponentFixture<OrderRefundBanner>, id: string, reason: string) {
  settleButton(f, id)?.click();
  f.detectChanges();
  const field = line(f, id)?.querySelector<HTMLTextAreaElement>(
    '[data-refund-settle-reason] textarea',
  );
  if (field) {
    field.value = reason;
    field.dispatchEvent(new Event('input'));
  }
  f.detectChanges();
  const confirm = [...(line(f, id)?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (button) => (button.textContent ?? '').includes('Noter rendu autrement'),
  );
  confirm?.click();
  await f.whenStable();
  f.detectChanges();
}

describe('le bandeau des remboursements par carte (plan M2, §5.3)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('rien sans demande', () => {
    const { fixture } = mount([]);

    expect(el(fixture).querySelector('[data-refund-banner]')).toBeNull();
  });

  it('une ligne par demande, chacune avec son état et son motif', () => {
    const { fixture } = mount([REQUEST, STOPPED]);

    const lines = el(fixture).querySelectorAll('[data-refund-banner]');
    expect(lines).toHaveLength(2);
    expect(lines[0]?.getAttribute('data-state')).toBe('to_issue');
    expect(text(lines[0])).toContain('23,40');
    expect(text(lines[0])).toContain('annulation');
    expect(text(lines[0])).toContain('en cours d');
    expect(lines[1]?.getAttribute('data-state')).toBe('stopped');
    expect(text(lines[1])).toContain('10,00');
    expect(text(lines[1])).toContain('paiement arrivé après l’annulation');
    expect(text(lines[1])).toContain('à faire');
    expect(text(lines[1])).toContain('La banque a refusé le remboursement chez Stripe.');
  });

  it('pas encore partie après un essai : la phrase du serveur', () => {
    const { fixture } = mount([
      {
        ...REQUEST,
        attempts: 3,
        lastFailure: 'Stripe n’a pas répondu (3 essais). Le système réessaie tout seul.',
      },
    ]);

    expect(text(line(fixture, 'rrq_1'))).toContain('à faire');
    expect(text(line(fixture, 'rrq_1'))).toContain('Stripe n’a pas répondu (3 essais)');
  });

  it('envoyée, rendue, rendue autrement : aucun geste', () => {
    const { fixture } = mount([
      {
        ...REQUEST,
        id: 'a',
        state: 'issued',
        issuedCents: 2_340,
        issuedAt: '2030-01-10T09:03:00.000Z',
      },
      { ...REQUEST, id: 'b', state: 'refunded', issuedCents: 2_340 },
      { ...REQUEST, id: 'c', state: 'settled_elsewhere' },
    ]);

    expect(text(line(fixture, 'a'))).toContain('en attente de la banque');
    expect(text(line(fixture, 'b'))).toContain('remboursé');
    expect(text(line(fixture, 'c'))).toContain('rendu autrement');
    expect(el(fixture).querySelector('[data-refund-retry]')).toBeNull();
    expect(el(fixture).querySelector('[data-refund-settle]')).toBeNull();
  });

  it('« Relancer » seulement quand le serveur le dit utile', () => {
    const { fixture } = mount([REQUEST, STOPPED]);

    expect(retryButton(fixture, 'rrq_1')).toBeNull();
    expect(retryButton(fixture, 'rrq_2')?.disabled).toBe(false);
  });

  it('« Rendu autrement » seulement sur une demande arrêtée', () => {
    const { fixture } = mount([
      { ...REQUEST, attempts: 2, lastFailure: 'x', retryable: true },
      STOPPED,
    ]);

    expect(settleButton(fixture, 'rrq_1')).toBeNull();
    expect(settleButton(fixture, 'rrq_2')).not.toBeNull();
  });

  it('les deux gestes désactivés sans card_payments:write', () => {
    const { fixture } = mount([STOPPED], ['b2b_orders:read', 'b2b_cancel_order:write']);

    expect(retryButton(fixture, 'rrq_2')?.disabled).toBe(true);
    expect(settleButton(fixture, 'rrq_2')?.disabled).toBe(true);
  });

  it('Relancer : demande au serveur PAR DEMANDE, puis fait relire', async () => {
    const { fixture, retryRefund, changed } = mount([REQUEST, STOPPED]);

    retryButton(fixture, 'rrq_2')?.click();
    await fixture.whenStable();

    expect(retryRefund).toHaveBeenCalledWith('rrq_2');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('un refus du serveur se dit sous SA demande, avec sa phrase', async () => {
    const { fixture, changed } = mount([STOPPED, { ...STOPPED, id: 'rrq_3' }], CAN, {
      retry: () =>
        Promise.reject(
          new HttpErrorResponse({
            status: 409,
            error: { code: 'x', message: 'Stripe traite déjà ce remboursement.' },
          }),
        ),
    });

    retryButton(fixture, 'rrq_3')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const errors = el(fixture).querySelectorAll('[data-refund-error]');
    expect(errors).toHaveLength(1);
    expect(text(errors[0])).toContain('Stripe traite déjà ce remboursement.');
    // Le refus suit la ligne qu'il concerne.
    expect(errors[0]?.previousElementSibling?.getAttribute('data-request')).toBe('rrq_3');
    expect(changed).not.toHaveBeenCalled();
  });

  it('Rendu autrement : le motif est obligatoire', async () => {
    const { fixture, settleRefundElsewhere } = mount([STOPPED]);

    await settle(fixture, 'rrq_2', '   ');

    expect(settleRefundElsewhere).not.toHaveBeenCalled();
    expect(text(el(fixture))).toContain('Le motif est obligatoire.');
  });

  it('Rendu autrement : envoie le motif nettoyé, puis fait relire', async () => {
    const { fixture, settleRefundElsewhere, changed } = mount([STOPPED]);

    await settle(fixture, 'rrq_2', '  Virement du 12/03  ');

    expect(settleRefundElsewhere).toHaveBeenCalledWith('rrq_2', 'Virement du 12/03');
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
