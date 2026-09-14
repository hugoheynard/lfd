import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { FR } from '../../../copy/fr';
import { bootCard, footButton, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { PaymentPanel } from '../payment-panel/payment-panel';
import { PaymentMobileCard } from './payment-mobile-card';

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('PaymentMobileCard', () => {
  it('ne nomme que les régimes convenus, et ouvre le panneau sur ce qui l’est', () => {
    const bare = bootCard(PaymentMobileCard, [{ ...TOMMEUSES, grantedTerms: [] }])
      .nativeElement as HTMLElement;
    expect(bare.textContent).toContain(FR.account.termOrder);
    expect(bare.textContent).not.toContain(FR.account.termMonthly);

    vi.stubGlobal('matchMedia', matchMediaAt(true));
    const granted = bootCard(PaymentMobileCard, [TOMMEUSES]).nativeElement as HTMLElement;
    expect(granted.textContent).toContain(FR.account.termMonthly);
    footButton(granted).click();
    expect(openedPanel()?.component).toBe(PaymentPanel);
    expect(openedPanel()?.data).toEqual({ deferred: true });
  });
});
