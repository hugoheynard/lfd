import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { ChorusInvoiceView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ChorusDepositsService } from '../../chorus-deposits.service';
import { type ChorusGesture, ChorusGesturePanel } from './chorus-gesture-panel';

// « Aujourd'hui » est injecté : les jours ne sont comparés qu'entre eux.
const TODAY = '2026-11-18';

const invoice = (over: Partial<ChorusInvoiceView['chorus']> = {}): ChorusInvoiceView => ({
  invoiceId: 'inv_1',
  number: 'FA-LFD-2026-000001',
  legalEntityId: 'le_1',
  legalEntityName: 'La Folie Douce',
  payerCompanyId: 'co_1',
  payerName: 'Régiment de test',
  issuedOn: '2026-11-02',
  totalTtcCents: 12_000,
  budgetCommitmentNumber: '1234567890',
  budgetCommitmentServiceCode: 'SERV1',
  documentAvailable: true,
  chorus: {
    state: 'to_deposit',
    paymentDeadlineDays: 30,
    depositedOn: null,
    rejectedOn: null,
    rejectionReason: null,
    acceptedOn: null,
    effectiveDueOn: null,
    ...over,
  },
});

function panel(gesture: ChorusGesture, bill: ChorusInvoiceView) {
  const sent: { gesture: string; id: string; payload: unknown }[] = [];
  const closed: { value: unknown } = { value: 'open' };
  const record = (name: string) => (id: string, payload: unknown) => {
    sent.push({ gesture: name, id, payload });
    return Promise.resolve();
  };
  TestBed.configureTestingModule({
    imports: [ChorusGesturePanel],
    providers: [
      {
        provide: ChorusDepositsService,
        useValue: {
          deposit: record('deposit'),
          reject: record('rejection'),
          accept: record('acceptance'),
        },
      },
      { provide: FoldPanelRef, useValue: { close: (value?: unknown) => (closed.value = value) } },
    ],
  });
  const fixture = TestBed.createComponent(ChorusGesturePanel);
  fixture.componentRef.setInput('data', { gesture, invoice: bill, today: TODAY });
  fixture.detectChanges();
  const submit = (): HTMLButtonElement =>
    fixture.debugElement.queryAll(By.css('footer button'))[1]?.nativeElement as HTMLButtonElement;
  const setDate = (value: string): void => {
    fixture.debugElement.query(By.css('fold-date')).componentInstance.value.set(value);
    fixture.detectChanges();
  };
  return { fixture, sent, closed, submit, setDate };
}

describe('ChorusGesturePanel', () => {
  it("« Déposée le » part d'aujourd'hui et envoie ce jour", async () => {
    const { fixture, sent, closed, submit } = panel('deposit', invoice());

    expect(submit().disabled).toBe(false);
    submit().click();
    await fixture.whenStable();

    expect(sent).toEqual([{ gesture: 'deposit', id: 'inv_1', payload: { occurredOn: TODAY } }]);
    expect(closed.value).toBe(true);
  });

  it('refuse un jour futur ou antérieur à la facture', () => {
    const { fixture, submit, setDate } = panel('deposit', invoice());

    setDate('2026-11-19');
    expect(submit().disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('futur');

    setDate('2026-11-01');
    expect(submit().disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('précéder la facture');
  });

  it('un rejet demande son motif, et pas avant le dépôt', async () => {
    const deposited = invoice({ state: 'deposited', depositedOn: '2026-11-10' });
    const { fixture, sent, submit, setDate } = panel('rejection', deposited);

    expect(submit().disabled).toBe(true);
    fixture.debugElement
      .query(By.css('fold-textarea'))
      .componentInstance.value.set('  Service inconnu ');
    fixture.detectChanges();
    expect(submit().disabled).toBe(false);

    setDate('2026-11-09');
    expect(submit().disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('précéder le dépôt');

    setDate('2026-11-12');
    submit().click();
    await fixture.whenStable();
    expect(sent).toEqual([
      {
        gesture: 'rejection',
        id: 'inv_1',
        payload: { occurredOn: '2026-11-12', reason: 'Service inconnu' },
      },
    ]);
  });

  it('un motif trop long bloque le geste', () => {
    const { fixture, submit } = panel(
      'rejection',
      invoice({ state: 'deposited', depositedOn: '2026-11-10' }),
    );

    fixture.debugElement
      .query(By.css('fold-textarea'))
      .componentInstance.value.set('x'.repeat(501));
    fixture.detectChanges();
    expect(submit().disabled).toBe(true);
  });
});
