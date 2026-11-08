import type { MailEditorListItem } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import { groupMailTemplates } from './mail-template-groups';

function item(
  template: string,
  audience: MailEditorListItem['audience'],
  family: MailEditorListItem['family'],
): MailEditorListItem {
  return {
    template,
    audience,
    family,
    charter: 'lfc',
    nature: 'transactional',
    locales: ['fr'],
    published: null,
    hasDraft: false,
  };
}

describe('groupMailTemplates', () => {
  it('range par destinataire puis par moment, en gardant l’ordre du serveur', () => {
    const groups = groupMailTemplates([
      item('staff.b', 'team', 'team'),
      item('customer.paid', 'customer', 'payment'),
      item('customer.b', 'customer', 'order'),
      item('customer.a', 'customer', 'order'),
    ]);
    expect(groups.map((group) => group.title)).toEqual(['Clients', 'Équipe']);
    expect(groups[0]?.families.map((family) => family.title)).toEqual(['Commande', 'Paiement']);
    expect(groups[0]?.families[0]?.mails.map((mail) => mail.template)).toEqual([
      'customer.b',
      'customer.a',
    ]);
  });

  it('ne montre aucun groupe vide', () => {
    expect(groupMailTemplates([])).toEqual([]);
  });
});
