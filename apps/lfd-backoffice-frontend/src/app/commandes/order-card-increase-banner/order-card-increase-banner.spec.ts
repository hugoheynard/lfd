import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { AdminOrderCardIncrease, StaffPermission } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminOrdersService } from '../orders.service';
import { OrderCardIncreaseBanner } from './order-card-increase-banner';

const CAN: readonly StaffPermission[] = ['b2b_orders:read', 'b2b_orders:write'];

/** Recopiée à l'écran, jamais comparée à l'horloge. */
const AWAITING: AdminOrderCardIncrease = {
  complementCents: 1_200,
  state: 'awaiting_payment',
  expiresAt: '2030-01-10T09:15:00.000Z',
  refusal: null,
};

interface Answers {
  readonly abandon?: () => Promise<void>;
  readonly relaunch?: () => Promise<void>;
}

function mount(
  increase: AdminOrderCardIncrease | null,
  permissions: readonly StaffPermission[] = CAN,
  answers: Answers = {},
) {
  const abandonCardIncrease = vi.fn(answers.abandon ?? (async () => undefined));
  const relaunchCardIncrease = vi.fn(answers.relaunch ?? (async () => undefined));
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminOrdersService, useValue: { abandonCardIncrease, relaunchCardIncrease } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderCardIncreaseBanner);
  fixture.componentRef.setInput('orderId', 'ord_1');
  fixture.componentRef.setInput('increase', increase);
  const changed = vi.fn();
  fixture.componentInstance.changed.subscribe(changed);
  fixture.detectChanges();
  return { fixture, abandonCardIncrease, relaunchCardIncrease, changed };
}

type Fixture = ComponentFixture<OrderCardIncreaseBanner>;
const el = (f: Fixture) => f.nativeElement as HTMLElement;
const text = (f: Fixture) => (el(f).textContent ?? '').replace(/\s+/gu, ' ');
const banner = (f: Fixture) => el(f).querySelector<HTMLElement>('[data-card-increase]');
const abandonButton = (f: Fixture) =>
  el(f).querySelector<HTMLButtonElement>('[data-card-increase-abandon]');
const relaunchButton = (f: Fixture) =>
  el(f).querySelector<HTMLButtonElement>('[data-card-increase-relaunch]');

/** Ouvre la confirmation en ligne, puis confirme. */
async function confirmAbandon(f: Fixture): Promise<void> {
  abandonButton(f)?.click();
  f.detectChanges();
  const confirm = [...el(f).querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    (button.textContent ?? '').includes('Abandonner la modification'),
  );
  confirm?.click();
  await f.whenStable();
  f.detectChanges();
}

describe('la hausse par carte qui attend (plan S2, §2.8)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('rien sans projet vivant', () => {
    const { fixture } = mount(null);

    expect(banner(fixture)).toBeNull();
  });

  it('en attente : le complément, son échéance, et « Abandonner » seul', () => {
    const { fixture } = mount(AWAITING);

    expect(banner(fixture)?.getAttribute('data-state')).toBe('awaiting_payment');
    expect(text(fixture)).toContain('Une modification attend son complément de 12,00');
    expect(text(fixture)).toContain('à payer avant le');
    expect(abandonButton(fixture)?.disabled).toBe(false);
    expect(relaunchButton(fixture)).toBeNull();
  });

  it('payé : « modification en cours », sans geste', () => {
    const { fixture } = mount({ ...AWAITING, state: 'ready' });

    expect(text(fixture)).toContain('Complément de 12,00');
    expect(text(fixture)).toContain('payé, modification en cours');
    expect(abandonButton(fixture)).toBeNull();
    expect(relaunchButton(fixture)).toBeNull();
  });

  it('bloqué : ton alerte, et « Relancer » seul', () => {
    const { fixture } = mount({ ...AWAITING, state: 'stalled' });

    expect(text(fixture)).toContain('modification bloquée');
    expect(banner(fixture)?.getAttribute('data-state')).toBe('stalled');
    expect(relaunchButton(fixture)?.disabled).toBe(false);
    expect(abandonButton(fixture)).toBeNull();
  });

  it('les deux gestes désactivés sans b2b_orders:write', () => {
    const awaiting = mount(AWAITING, ['b2b_orders:read']);
    expect(abandonButton(awaiting.fixture)?.disabled).toBe(true);
    TestBed.resetTestingModule();
    const stalled = mount({ ...AWAITING, state: 'stalled' }, ['b2b_orders:read']);
    expect(relaunchButton(stalled.fixture)?.disabled).toBe(true);
  });

  it('Abandonner : après confirmation, demande au serveur puis fait relire', async () => {
    const { fixture, abandonCardIncrease, changed } = mount(AWAITING);

    await confirmAbandon(fixture);

    expect(abandonCardIncrease).toHaveBeenCalledWith('ord_1');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('Relancer : demande au serveur puis fait relire', async () => {
    const { fixture, relaunchCardIncrease, changed } = mount({ ...AWAITING, state: 'stalled' });

    relaunchButton(fixture)?.click();
    await fixture.whenStable();

    expect(relaunchCardIncrease).toHaveBeenCalledWith('ord_1');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('un refus du serveur se dit avec sa phrase, sans relire', async () => {
    const { fixture, changed } = mount(AWAITING, CAN, {
      abandon: () =>
        Promise.reject(
          new HttpErrorResponse({
            status: 409,
            error: { code: 'x', message: 'Le complément vient d’être payé.' },
          }),
        ),
    });

    await confirmAbandon(fixture);

    expect(el(fixture).querySelector('[data-card-increase-error]')?.textContent).toContain(
      'Le complément vient d’être payé.',
    );
    expect(changed).not.toHaveBeenCalled();
  });
});
