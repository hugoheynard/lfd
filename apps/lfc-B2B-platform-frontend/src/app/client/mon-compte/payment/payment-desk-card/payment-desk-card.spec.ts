import { FR } from '../../../copy/fr';
import { bootCard, TOMMEUSES } from '../../account.fixture';
import { PaymentDeskCard } from './payment-desk-card';

describe('PaymentDeskCard', () => {
  /** La pastille disait « actif » sans regarder : elle suit ce qui est CONVENU. */
  it('dit lequel des deux régimes est convenu, et la règle', () => {
    const badges = (el: HTMLElement): string[] =>
      Array.from(el.querySelectorAll('fold-badge')).map((b) => b.textContent?.trim() ?? '');

    const granted = bootCard(PaymentDeskCard, [TOMMEUSES]).nativeElement as HTMLElement;
    expect(badges(granted)).toEqual([FR.account.stateActive, FR.account.stateAvailable]);
    expect(granted.textContent).toContain(FR.account.paymentNote);

    const bare = bootCard(PaymentDeskCard, [{ ...TOMMEUSES, grantedTerms: [] }])
      .nativeElement as HTMLElement;
    expect(badges(bare)[0]).toBe(FR.account.stateUnavailable);
  });
});
