import type { ReachableSiteView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { asRole, TOMMEUSES } from '../mon-compte/account.fixture';
import { manageableSites } from './manageable-sites';

const CHALET = { ...TOMMEUSES, id: 'cmp_chalet', enseigne: 'Chalet' };
const OTHER = { ...TOMMEUSES, id: 'cmp_other', enseigne: 'Ailleurs' };

function reachable(company: typeof CHALET, via: string): ReachableSiteView {
  return { company, via: { companyId: via, name: 'Principal' }, canReadBilling: true };
}

const ACCOUNT = {
  reachableSites: [reachable(CHALET, TOMMEUSES.id), reachable(OTHER, 'cmp_elsewhere')],
};

describe('manageableSites (§ 3.2)', () => {
  it('rend les sites atteints PAR le principal affiché, à son propriétaire', () => {
    expect(manageableSites(ACCOUNT, asRole('owner')).map((site) => site.id)).toEqual([
      'cmp_chalet',
    ]);
  });

  it('les rend à son administrateur', () => {
    expect(manageableSites(ACCOUNT, asRole('admin'))).toHaveLength(1);
  });

  it('ne rend rien à un membre « commandes » ou « facturation » du principal', () => {
    expect(manageableSites(ACCOUNT, asRole('orders'))).toEqual([]);
    expect(manageableSites(ACCOUNT, asRole('billing'))).toEqual([]);
  });

  it('ne rend rien sans compte ni principal', () => {
    expect(manageableSites(null, asRole('owner'))).toEqual([]);
    expect(manageableSites(ACCOUNT, null)).toEqual([]);
  });
});
