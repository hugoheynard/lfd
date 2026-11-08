import type { MailEditorListItem } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import { groupMailSpaces, mailSpaceListing } from './mail-template-spaces';

function item(
  template: string,
  charter: MailEditorListItem['charter'],
  audience: MailEditorListItem['audience'],
  family: MailEditorListItem['family'],
  space?: MailEditorListItem['space'],
): MailEditorListItem {
  return {
    template,
    audience,
    family,
    charter,
    nature: 'transactional',
    ...(space === undefined ? {} : { space }),
    locales: ['fr'],
    published: null,
    hasDraft: false,
  };
}

describe('groupMailSpaces', () => {
  it('range chaque e-mail dans son espace, les internes sous « Interne » à La Folie Douce', () => {
    const spaces = groupMailSpaces([
      item('staff.account-alert', 'internal', 'team', 'team', 'lfd'),
      item('customer.order-placed', 'lfc', 'customer', 'order', 'lfc'),
      item('staff.invited', 'lfd', 'team', 'team', 'lfd'),
    ]);
    expect(spaces.map((space) => space.title)).toEqual([
      'La Folie Coffee — clients',
      'La Folie Douce — équipe',
    ]);
    expect(spaces[0]?.count).toBe(1);
    const lfd = spaces[1];
    expect(lfd?.count).toBe(2);
    expect(lfd?.groups.map((group) => group.title)).toEqual(['Équipe', 'Interne']);
    expect(lfd?.groups[1]?.families[0]?.mails.map((mail) => mail.template)).toEqual([
      'staff.account-alert',
    ]);
  });

  it('sans `space` servi, lit l’espace de la charte : `internal` va à La Folie Douce', () => {
    const spaces = groupMailSpaces([item('ops.deploy-check', 'internal', 'team', 'team')]);
    expect(spaces[0]?.count).toBe(0);
    expect(spaces[1]?.groups.map((group) => group.key)).toEqual(['internal']);
  });

  it('garde les deux espaces même vides : chacun mène à sa charte', () => {
    const spaces = groupMailSpaces([]);
    expect(spaces.map((space) => space.space)).toEqual(['lfc', 'lfd']);
    expect(spaces.every((space) => space.groups.length === 0)).toBe(true);
  });
});

describe('mailSpaceListing', () => {
  it('compte les brouillons de l’espace seulement', () => {
    const mails = [
      { ...item('customer.order-placed', 'lfc', 'customer', 'order', 'lfc'), hasDraft: true },
      { ...item('staff.invited', 'lfd', 'team', 'team', 'lfd'), hasDraft: true },
      item('staff.account-alert', 'internal', 'team', 'team', 'lfd'),
    ];
    expect(mailSpaceListing(mails, 'lfc')?.draftCount).toBe(1);
    expect(mailSpaceListing(mails, 'lfd')).toMatchObject({ count: 2, draftCount: 1 });
  });

  it('rend `null` pour un segment qui n’est pas un espace', () => {
    expect(mailSpaceListing([], 'ailleurs')).toBeNull();
  });
});
