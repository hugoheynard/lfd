import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';

import { FR } from '../../../copy/fr';
import { PaymentPanel } from './payment-panel';

function render(deferred: boolean): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PaymentPanel],
    providers: [{ provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) }],
  });
  const fixture = TestBed.createComponent(PaymentPanel);
  fixture.componentRef.setInput('data', { deferred });
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PaymentPanel', () => {
  /** L'absence de crédit ne ressemble pas à un refus : « non accordé », à côté du régime ouvert. */
  it('dit lequel des deux régimes est convenu, et la règle', () => {
    const badges = (el: HTMLElement): string[] =>
      Array.from(el.querySelectorAll('fold-badge')).map((b) => b.textContent?.trim() ?? '');

    expect(badges(render(true))).toEqual([FR.account.stateActive, FR.account.stateAvailable]);
    const without = render(false);
    expect(badges(without)).toEqual([FR.account.stateUnavailable, FR.account.stateAvailable]);
    expect(without.textContent).toContain(FR.account.paymentNote);
  });
});
