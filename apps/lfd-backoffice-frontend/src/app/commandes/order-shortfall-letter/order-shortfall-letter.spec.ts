import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { AdminOrderShortfall, StaffPermission } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminOrdersService } from '../orders.service';
import { OrderShortfallLetter } from './order-shortfall-letter';

/** Recopiées à l'écran, jamais comparées à l'horloge. */
const AWAITING: AdminOrderShortfall = {
  reportedAt: '2030-01-10T05:30:00.000Z',
  lines: [{ sku: 'CRO', due: 3, packed: 1, saleUnit: 'piece' }],
  decision: null,
};
const DECIDED: AdminOrderShortfall = {
  ...AWAITING,
  decision: { decidedAt: '2030-01-10T06:00:00.000Z', remainder: 'abandoned', customerNotice: null },
};
const NOTIFIED: AdminOrderShortfall = {
  ...AWAITING,
  decision: {
    decidedAt: '2030-01-10T06:00:00.000Z',
    remainder: 'abandoned',
    customerNotice: { notifiedAt: '2030-01-10T06:10:00.000Z', notifiedByName: 'Hugo Heynard' },
  },
};
const CAN: readonly StaffPermission[] = ['b2b_orders:read', 'b2b_orders_shortfall:write'];
const PROPOSAL = 'Bonjour,\n\nCe qui part :\n– 1 × Croissant';

function mount(
  shortfall: AdminOrderShortfall | null,
  options: {
    readonly permissions?: readonly StaffPermission[];
    readonly write?: () => Promise<void>;
  } = {},
) {
  const shortfallLetterDraft = vi.fn(async () => ({ message: PROPOSAL }));
  const writeShortfallLetter = vi.fn(options.write ?? (async () => undefined));
  const permissions = options.permissions ?? CAN;
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminOrdersService, useValue: { shortfallLetterDraft, writeShortfallLetter } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderShortfallLetter);
  fixture.componentRef.setInput('orderId', 'ord_1');
  fixture.componentRef.setInput('shortfall', shortfall);
  const done = vi.fn();
  fixture.componentInstance.sent.subscribe(done);
  fixture.detectChanges();
  return { fixture, shortfallLetterDraft, writeShortfallLetter, done };
}

const el = (f: ComponentFixture<OrderShortfallLetter>) => f.nativeElement as HTMLElement;

async function openProposal(fixture: ComponentFixture<OrderShortfallLetter>): Promise<void> {
  el(fixture).querySelector<HTMLButtonElement>('[data-shortfall-letter-open]')?.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('« Écrire au client » (E6d)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('ne rend rien tant que le départ n’est pas décidé', () => {
    expect(el(mount(AWAITING).fixture).querySelector('[data-shortfall-letter-open]')).toBeNull();
  });

  it("n'offre pas le geste sans `b2b_orders_shortfall:write`", () => {
    const { fixture } = mount(DECIDED, { permissions: ['b2b_orders:read'] });
    expect(el(fixture).querySelector('[data-shortfall-letter-open]')).toBeNull();
  });

  it('ouvre la proposition, envoie le texte RELU, puis fait relire la commande', async () => {
    const { fixture, writeShortfallLetter, done } = mount(DECIDED);
    await openProposal(fixture);
    expect(fixture.componentInstance['draft']()).toBe(PROPOSAL);

    fixture.componentInstance['draft'].set(`${PROPOSAL}\n\nÀ demain.`);
    fixture.detectChanges();
    el(fixture).querySelector<HTMLButtonElement>('[data-shortfall-letter-send]')?.click();
    await fixture.whenStable();

    expect(writeShortfallLetter).toHaveBeenCalledWith('ord_1', {
      message: `${PROPOSAL}\n\nÀ demain.`,
    });
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('ferme sans rien envoyer', async () => {
    const { fixture, writeShortfallLetter } = mount(DECIDED);
    await openProposal(fixture);

    el(fixture).querySelector<HTMLButtonElement>('[data-shortfall-letter-close]')?.click();
    fixture.detectChanges();

    expect(writeShortfallLetter).not.toHaveBeenCalled();
    expect(el(fixture).querySelector('[data-shortfall-letter-text]')).toBeNull();
  });

  it('n’envoie pas un texte vide', async () => {
    const { fixture, writeShortfallLetter } = mount(DECIDED);
    await openProposal(fixture);
    fixture.componentInstance['draft'].set('   ');
    fixture.detectChanges();

    await fixture.componentInstance['send']();

    expect(writeShortfallLetter).not.toHaveBeenCalled();
  });

  it('dit l’envoi refusé par le fournisseur d’après son code, le message serveur étant masqué', async () => {
    const { fixture } = mount(DECIDED, {
      write: () =>
        Promise.reject(
          new HttpErrorResponse({
            status: 500,
            error: { code: 'orders.shortfall_letter.not_sent', message: 'Erreur interne.' },
          }),
        ),
    });
    await openProposal(fixture);

    await fixture.componentInstance['send']();
    fixture.detectChanges();

    expect(el(fixture).querySelector('[data-shortfall-letter-error]')?.textContent).toContain(
      "Le courriel n'est pas parti, et rien n'a été tracé.",
    );
  });

  it('dit « Client prévenu le … par … » une fois le courriel parti, sans plus offrir le geste', () => {
    const { fixture } = mount(NOTIFIED, { permissions: ['b2b_orders:read'] });
    const text = el(fixture).querySelector('[data-shortfall-notified]')?.textContent ?? '';
    expect(text).toContain('Client prévenu le');
    expect(text).toContain('par');
    expect(text).toContain('Hugo Heynard');
    expect(el(fixture).querySelector('[data-shortfall-letter-open]')).toBeNull();
  });
});
