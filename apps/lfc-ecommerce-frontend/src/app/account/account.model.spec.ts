import type { CompanyView } from '@lfd/contracts';

import { TOMMEUSES } from '../client/mon-compte/account.fixture';
import { directDebitSuspended, settlementSummary, settlesOnAccount } from './account.model';

const GRANTED: CompanyView = TOMMEUSES;
const SUSPENDED: CompanyView = { ...TOMMEUSES, directDebitBlocked: true };
const NONE: CompanyView = { ...TOMMEUSES, grantedTerms: [] };

describe('le règlement au compte', () => {
  it('ne s’exerce que sur un mensuel accordé ET non suspendu', () => {
    expect(settlesOnAccount(GRANTED)).toBe(true);
    expect(settlesOnAccount(SUSPENDED)).toBe(false);
    expect(settlesOnAccount(NONE)).toBe(false);
    expect(settlesOnAccount(null)).toBe(false);
  });

  it('ne se dit suspendu que si le crédit est accordé', () => {
    expect(directDebitSuspended(SUSPENDED)).toBe(true);
    expect(directDebitSuspended(GRANTED)).toBe(false);
    expect(directDebitSuspended({ ...NONE, directDebitBlocked: true })).toBe(false);
  });

  it('ne résume pas un crédit suspendu parmi les moyens de règlement', () => {
    expect(settlementSummary(GRANTED)).toContain(' · ');
    expect(settlementSummary(SUSPENDED)).toBe('À la commande');
  });
});
