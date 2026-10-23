import { describe, expect, it } from 'vitest';

import { mailView } from '../mail-copy.testing';
import { groupMails } from './mail-groups';

describe('groupMails — par destinataire, puis par moment (C8)', () => {
  it('range Clients, Équipe, Agence, et leurs moments dans l’ordre, sans groupe vide', () => {
    const groups = groupMails([
      mailView('agency.vitrine-notice', [], { audience: 'agency', family: 'account' }),
      mailView('customer.payment-failed', [], { family: 'payment' }),
      mailView('staff.invited', [], { audience: 'team', family: 'team' }),
      mailView('customer.order-placed', [], { family: 'order' }),
    ]);
    expect(groups.map((group) => group.title)).toEqual(['Clients', 'Équipe', 'Agence']);
    expect(groups[0]?.families.map((family) => family.title)).toEqual(['Commande', 'Paiement']);
    expect(groups[0]?.families[0]?.mails.map((mail) => mail.mail)).toEqual([
      'customer.order-placed',
    ]);
  });
});
