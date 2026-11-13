import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type {
  AdminOrderShortfall,
  SettlementRegime,
  StaffNote,
  StaffPermission,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { DeliveryNotesService } from '../delivery-notes.service';
import { AdminOrdersService } from '../orders.service';
import { OrderShortfallDecision } from './order-shortfall-decision';

/** Recopiées à l'écran, jamais comparées à l'horloge. */
const AWAITING: AdminOrderShortfall = {
  reportedAt: '2030-01-10T05:30:00.000Z',
  lines: [{ sku: 'CRO', due: 12, packed: 9, saleUnit: 'piece' }],
  decision: null,
};
const DECIDED: AdminOrderShortfall = {
  ...AWAITING,
  decision: { decidedAt: '2030-01-10T06:00:00.000Z', remainder: 'abandoned', customerNotice: null },
};
const CAN: readonly StaffPermission[] = ['b2b_orders:read', 'b2b_orders_shortfall:write'];

function mount(
  shortfall: AdminOrderShortfall | null,
  options: {
    readonly permissions?: readonly StaffPermission[];
    readonly decide?: () => Promise<void>;
    readonly notes?: readonly Pick<StaffNote, 'number' | 'reprintNeeded'>[];
    readonly settlement?: SettlementRegime;
    readonly increasePending?: boolean;
  } = {},
) {
  const decideShortfall = vi.fn(options.decide ?? (async () => undefined));
  const openCarrier = vi.fn(async () => undefined);
  const permissions = options.permissions ?? CAN;
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminOrdersService, useValue: { decideShortfall } },
      {
        provide: DeliveryNotesService,
        useValue: { ofOrder: () => Promise.resolve(options.notes ?? []), openCarrier },
      },
      { provide: NotifyService, useValue: { error: () => undefined } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderShortfallDecision);
  fixture.componentRef.setInput('orderId', 'ord_1');
  fixture.componentRef.setInput('shortfall', shortfall);
  fixture.componentRef.setInput('lines', [{ sku: 'CRO', productName: 'Croissant' }]);
  if (options.settlement !== undefined) {
    fixture.componentRef.setInput('settlement', options.settlement);
  }
  if (options.increasePending !== undefined) {
    fixture.componentRef.setInput('increasePending', options.increasePending);
  }
  const done = vi.fn();
  fixture.componentInstance.decided.subscribe(done);
  fixture.detectChanges();
  return { fixture, decideShortfall, openCarrier, done };
}

const el = (f: ComponentFixture<OrderShortfallDecision>) => f.nativeElement as HTMLElement;

describe('« Décider du départ » (E6b)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it("n'existe pas sans `b2b_orders_shortfall:write`", () => {
    const { fixture } = mount(AWAITING, { permissions: ['b2b_orders:read'] });
    expect(el(fixture).querySelector('[data-shortfall-decide]')).toBeNull();
  });

  it('ne rend rien sans manque signalé', () => {
    expect(el(mount(null).fixture).querySelector('[data-shortfall-decide]')).toBeNull();
  });

  it('montre ce qui part, en lecture, puis décide « reste abandonné »', async () => {
    const { fixture, decideShortfall, done } = mount(AWAITING);
    fixture.componentInstance['open'].set(true);
    fixture.detectChanges();
    expect(el(fixture).querySelector('[data-shortfall-departing]')?.textContent).toContain(
      'Croissant : 9 sur 12 part',
    );

    await fixture.componentInstance['confirm']();

    expect(decideShortfall).toHaveBeenCalledWith('ord_1', { remainder: 'abandoned' });
    expect(done).toHaveBeenCalledOnce();
  });

  it('dit le refus du serveur, avec sa phrase', async () => {
    const message = 'Le bac a changé depuis le signal : rien n’a été décidé.';
    const { fixture, done } = mount(AWAITING, {
      decide: () => Promise.reject(new HttpErrorResponse({ status: 409, error: { message } })),
    });

    await fixture.componentInstance['confirm']();
    fixture.detectChanges();

    expect(el(fixture).querySelector('[data-shortfall-decision-error]')?.textContent).toContain(
      message,
    );
    expect(done).not.toHaveBeenCalled();
  });

  it('une fois décidé, le dit, et demande de réimprimer un BL imprimé avant (§ 14)', async () => {
    const { fixture, openCarrier } = mount(DECIDED, {
      notes: [{ number: 'BL-0001-1', reprintNeeded: true }],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el(fixture).querySelector('[data-shortfall-decided]')).not.toBeNull();
    expect(el(fixture).querySelector('[data-reprint-needed="BL-0001-1"]')?.textContent).toContain(
      'réimprimez-le',
    );
    el(fixture).querySelector<HTMLButtonElement>('[data-reprint]')?.click();
    expect(openCarrier).toHaveBeenCalledWith('ord_1', 'BL-0001-1');
  });

  it('un BL jamais imprimé ne déclenche rien', async () => {
    const { fixture } = mount(DECIDED, { notes: [{ number: 'BL-0001-1', reprintNeeded: false }] });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el(fixture).querySelector('[data-reprint-needed]')).toBeNull();
  });

  it('une fois décidé, dit le reste abandonné ligne par ligne', () => {
    const { fixture } = mount(DECIDED);
    expect(el(fixture).querySelector('[data-abandoned-remainder]')?.textContent).toContain(
      'Reste abandonné : 3 Croissant',
    );
  });
});

describe('« Décider du départ » d’une commande réglée par carte (plan E9)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  const said = (f: ComponentFixture<OrderShortfallDecision>, selector: string): string =>
    (el(f).querySelector(selector)?.textContent ?? '').replace(/\s+/gu, ' ').trim();

  it('carte pas encore encaissée : dit le refus à la place du geste', () => {
    const { fixture } = mount(AWAITING, { settlement: 'due' });

    expect(el(fixture).querySelector('[data-shortfall-decide]')).toBeNull();
    expect(said(fixture, '[data-shortfall-card-refusal]')).toContain(
      'la carte n’est pas encore encaissée : le départ incomplet attend le paiement',
    );
  });

  it('hausse par carte vivante : dit le refus à la place du geste', () => {
    const { fixture } = mount(AWAITING, { settlement: 'paid', increasePending: true });

    expect(el(fixture).querySelector('[data-shortfall-decide]')).toBeNull();
    expect(said(fixture, '[data-shortfall-card-refusal]')).toContain(
      'Une hausse par carte est en cours',
    );
  });

  it('sans le droit de décider, ne dit pas le refus non plus', () => {
    const { fixture } = mount(AWAITING, { settlement: 'due', permissions: ['b2b_orders:read'] });

    expect(el(fixture).querySelector('[data-shortfall-card-refusal]')).toBeNull();
  });

  it('carte encaissée : le geste est offert, et sa confirmation dit le reste remboursé au solde', () => {
    const { fixture } = mount(AWAITING, { settlement: 'paid' });

    expect(el(fixture).querySelector('[data-shortfall-decide]')).not.toBeNull();
    expect(el(fixture).querySelector('[data-shortfall-card-refusal]')).toBeNull();
    expect(fixture.componentInstance['confirmMessage']()).toContain(
      'Il sera remboursé sur la carte au solde.',
    );
  });

  it('au compte : la confirmation ne promet aucun remboursement', () => {
    const { fixture } = mount(AWAITING, { settlement: 'account' });

    expect(fixture.componentInstance['confirmMessage']()).not.toContain('remboursé');
  });

  it('une fois décidé sur une carte encaissée, dit que le reste est remboursé au solde', async () => {
    const { fixture } = mount(DECIDED, { settlement: 'paid' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(said(fixture, '[data-shortfall-refunded-at-settlement]')).toContain(
      'remboursé sur la carte au solde',
    );
  });

  it('une fois décidé au compte, ne parle pas de carte', async () => {
    const { fixture } = mount(DECIDED, { settlement: 'account' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el(fixture).querySelector('[data-shortfall-refunded-at-settlement]')).toBeNull();
  });
});
