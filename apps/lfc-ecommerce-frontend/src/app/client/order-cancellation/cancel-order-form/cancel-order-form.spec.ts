import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { orderCancelCopy } from '../../copy/screens/order-cancel.copy';
import type { CancellableState, CancelReason } from '../cancellation-wording';
import { CancelOrderForm, reasonOf } from './cancel-order-form';

const FR = orderCancelCopy('fr');

const REFUND: CancellableState = {
  cancellable: true,
  until: '2026-10-14T07:00:00.000Z',
  money: { kind: 'refund', amountCents: 1890 },
  voucherReturned: true,
};

describe('CancelOrderForm', () => {
  let fixture: ComponentFixture<CancelOrderForm>;
  let confirmed: CancelReason[];
  let kept: number;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    confirmed = [];
    kept = 0;
    TestBed.configureTestingModule({ imports: [CancelOrderForm] });
    fixture = TestBed.createComponent(CancelOrderForm);
    fixture.componentRef.setInput('state', REFUND);
    fixture.componentInstance.confirmed.subscribe((reason) => confirmed.push(reason));
    fixture.componentInstance.kept.subscribe(() => (kept += 1));
    fixture.detectChanges();
  });

  it('dit l’argent, le bon et l’échéance avant de confirmer', () => {
    expect(el().querySelector('[data-money]')?.textContent).toContain('18,90');
    expect(el().querySelector('[data-voucher]')?.textContent).toContain(FR.voucherBack);
    expect(el().querySelector('[data-until]')?.textContent).toContain('14/10');
  });

  it('dit « rien ne sera facturé » au compte, sans bon ni échéance', () => {
    fixture.componentRef.setInput('state', {
      cancellable: true,
      until: null,
      money: { kind: 'account' },
      voucherReturned: false,
    });
    fixture.detectChanges();
    expect(el().querySelector('[data-money]')?.textContent?.trim()).toBe(FR.moneyAccount);
    expect(el().querySelector('[data-voucher]')).toBeNull();
    expect(el().querySelector('[data-until]')).toBeNull();
  });

  it('confirme sans motif : le motif est facultatif', () => {
    el().querySelector<HTMLButtonElement>('[data-confirm]')?.click();
    expect(confirmed).toEqual([{}]);
  });

  it('propose les quatre motifs, et le texte libre seulement pour « Autre »', () => {
    const form = fixture.componentInstance;
    expect(form['reasonOptions']().map((option) => option.value)).toEqual([
      'no_longer_needed',
      'wrong_date',
      'wrong_products',
      'other',
    ]);
    expect(el().querySelector('fold-textarea')).toBeNull();

    form['reasonCode'].set('other');
    fixture.detectChanges();
    expect(el().querySelector('fold-textarea')).not.toBeNull();

    form['setText']('x'.repeat(600));
    el().querySelector<HTMLButtonElement>('[data-confirm]')?.click();
    expect(confirmed[0]?.reasonText?.length).toBe(500);
  });

  it('« Garder ma commande » n’annule rien', () => {
    el().querySelector<HTMLButtonElement>('[data-keep]')?.click();
    expect(kept).toBe(1);
    expect(confirmed).toEqual([]);
  });

  it('affiche le refus du serveur, la confirmation ouverte', () => {
    fixture.componentRef.setInput('refusal', FR.refusals.in_preparation);
    fixture.detectChanges();
    expect(el().querySelector('[data-refusal]')?.textContent).toContain(FR.refusals.in_preparation);
    expect(el().querySelector('[data-confirm]')).not.toBeNull();
  });

  it('fige les boutons pendant l’écriture', () => {
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    const confirm = el().querySelector<HTMLButtonElement>('[data-confirm]');
    expect(confirm?.disabled).toBe(true);
    expect(confirm?.textContent?.trim()).toBe(FR.confirming);
  });
});

describe('reasonOf', () => {
  it('ne porte le texte que pour « Autre »', () => {
    expect(reasonOf(null, 'peu importe')).toEqual({});
    expect(reasonOf('wrong_date', 'tapé puis abandonné')).toEqual({ reasonCode: 'wrong_date' });
    expect(reasonOf('other', '  plus de place  ')).toEqual({
      reasonCode: 'other',
      reasonText: 'plus de place',
    });
    expect(reasonOf('other', '   ')).toEqual({ reasonCode: 'other' });
  });
});
