import { TestBed } from '@angular/core/testing';
import type { CompanyView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { FR } from '../../../copy/fr';
import {
  asRole,
  bootCard,
  footButton,
  matchMediaAt,
  openedPanel,
  TOMMEUSES,
} from '../../account.fixture';
import { PaymentPanel } from '../payment-panel/payment-panel';
import { PaymentMobileCard } from './payment-mobile-card';

const GRANTED: CompanyView = TOMMEUSES;
const REQUESTED: CompanyView = { ...TOMMEUSES, grantedTerms: [], requestedTerm: 'monthly' };
const NONE: CompanyView = { ...TOMMEUSES, grantedTerms: [], requestedTerm: null };

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

const render = (companies: readonly CompanyView[]): HTMLElement =>
  bootCard(PaymentMobileCard, companies).nativeElement as HTMLElement;

describe('PaymentMobileCard', () => {
  it.each([
    ['accordé', GRANTED, FR.account.stateActive],
    ['demandé', REQUESTED, FR.account.stateRequested],
    ['ni l’un ni l’autre', NONE, FR.account.stateUnavailable],
  ] as const)(
    'crédit %s : le régime ouvert à tous, et le crédit avec son état',
    (_, company, state) => {
      const el = render([company]);

      expect(el.textContent).toContain(FR.account.termOrder);
      expect(el.querySelector('.monthly')?.textContent?.trim()).toBe(
        `${FR.account.termMonthly} · ${state}`,
      );
    },
  );

  it('ouvre le panneau, par le bas, sur la société, son état et le droit de demander', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));

    footButton(render([NONE])).click();
    expect(openedPanel()?.component).toBe(PaymentPanel);
    expect(openedPanel()?.side).toBe('bottom');
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1', monthly: 'none', canRequest: true });

    TestBed.inject(FoldPanelHostService).dismissAll();
    footButton(render([asRole('billing', REQUESTED)])).click();
    expect(openedPanel()?.data).toEqual({
      companyId: 'cmp_1',
      monthly: 'requested',
      canRequest: false,
    });
  });

  it('sans société, dit le régime ouvert à tous et n’ouvre rien', () => {
    const el = render([]);

    expect(el.textContent).toContain(FR.account.termOrder);
    footButton(el).click();
    expect(openedPanel()).toBeNull();
  });

  /** Régression : « Accordé le 14/02/2024 · plafond 2 000 € », écrit en dur, lu par tout le monde. */
  it('n’affiche ni date d’accord ni plafond, dans aucun état', () => {
    for (const company of [GRANTED, REQUESTED, NONE]) {
      const text = render([company]).textContent ?? '';
      expect(text).not.toMatch(/\d{2}\/\d{2}\/\d{4}|€|plafond/);
    }
  });
});
