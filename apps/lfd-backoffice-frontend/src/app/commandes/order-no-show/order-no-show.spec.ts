import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { CounterParticularsService } from '../../comptoir/counter-particulars.service';
import { OrderNoShow, type NoShowSubject } from './order-no-show';

const COUNTER: readonly StaffPermission[] = ['b2b_place_order:write'];
const SUPERVISOR: readonly StaffPermission[] = [...COUNTER, 'b2b_supervision:write'];

const AWAITING: NoShowSubject = {
  id: 'o1',
  status: 'ready',
  settlement: 'shop_till',
  noShow: null,
};

const DECLARED: NoShowSubject = {
  ...AWAITING,
  status: 'no_show',
  noShow: { declaredAt: '2026-11-20T18:00:00.000Z', declaredByName: 'Lou', noticeRequest: null },
};

function mount(
  order: NoShowSubject,
  granted: readonly StaffPermission[],
  declareNoShow = vi.fn(() => Promise.resolve()),
) {
  const requestNoShowNotice = vi.fn(() => Promise.resolve());
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: CounterParticularsService, useValue: { declareNoShow, requestNoShowNotice } },
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
    ],
  });
  const fixture = TestBed.createComponent(OrderNoShow);
  fixture.componentRef.setInput('order', order);
  let changed = 0;
  fixture.componentInstance.changed.subscribe(() => (changed += 1));
  fixture.detectChanges();
  return { fixture, declareNoShow, requestNoShowNotice, changed: () => changed };
}

const el = (f: ComponentFixture<OrderNoShow>) => f.nativeElement as HTMLElement;

describe('OrderNoShow — le client n’est pas venu', () => {
  it('se propose sur une commande à régler en boutique qui attend encore', () => {
    const { fixture } = mount(AWAITING, COUNTER);
    expect(el(fixture).querySelector('[data-no-show-declare]')).not.toBeNull();
  });

  it('se tait hors de la caisse de la boutique, sur une remise, ou sans le droit', () => {
    expect(el(mount({ ...AWAITING, settlement: 'account' }, COUNTER).fixture).textContent).toBe('');
    expect(
      el(mount({ ...AWAITING, status: 'fulfilled' }, COUNTER).fixture).querySelector(
        '[data-no-show-declare]',
      ),
    ).toBeNull();
    expect(el(mount(AWAITING, []).fixture).querySelector('[data-no-show-declare]')).toBeNull();
  });

  it('déclare sous une clé d’intention, et affiche tel quel le refus « trop tôt »', async () => {
    const tooEarly = new HttpErrorResponse({
      status: 409,
      error: { code: 'orders.no_show.too_early', message: 'Le créneau n’est pas fini.' },
    });
    const { fixture, declareNoShow } = mount(
      AWAITING,
      COUNTER,
      vi.fn(() => Promise.reject(tooEarly)),
    );
    await fixture.componentInstance['declare']();
    fixture.detectChanges();
    expect(declareNoShow).toHaveBeenCalledWith('o1', expect.any(String));
    expect(el(fixture).querySelector('[data-no-show-error]')?.textContent).toContain(
      'Le créneau n’est pas fini.',
    );
  });

  it('dit qui l’a déclarée, et ne propose « Prévenir le client » qu’à la supervision', () => {
    const counter = mount(DECLARED, COUNTER).fixture;
    expect(el(counter).querySelector('[data-no-show-declared]')?.textContent).toContain('par Lou');
    expect(el(counter).querySelector('[data-no-show-notify]')).toBeNull();
    expect(
      el(mount(DECLARED, SUPERVISOR).fixture).querySelector('[data-no-show-notify]'),
    ).not.toBeNull();
  });

  it('dit l’e-mail DEMANDÉ, jamais envoyé', async () => {
    const { fixture, requestNoShowNotice, changed } = mount(DECLARED, SUPERVISOR);
    await fixture.componentInstance['notify']();
    expect(requestNoShowNotice).toHaveBeenCalledWith('o1', expect.any(String));
    expect(changed()).toBe(1);

    fixture.componentRef.setInput('order', {
      ...DECLARED,
      noShow: {
        declaredAt: '2026-11-20T18:00:00.000Z',
        declaredByName: 'Lou',
        noticeRequest: { requestedAt: '2026-11-21T08:00:00.000Z', requestedByName: 'Max' },
      },
    });
    fixture.detectChanges();
    const line = el(fixture).querySelector('[data-no-show-notice]')?.textContent ?? '';
    expect(line).toContain('E-mail demandé le');
    expect(line).toContain('par Max');
    expect(el(fixture).textContent).not.toContain('envoyé');
  });
});
