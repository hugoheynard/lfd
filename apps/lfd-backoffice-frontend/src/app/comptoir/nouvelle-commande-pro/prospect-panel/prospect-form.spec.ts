import { describe, expect, it } from 'vitest';

import { prospectIssue, type ProspectDraft } from './prospect-form';

const COMPLETE: ProspectDraft = {
  enseigne: 'Chez Lulu',
  firstName: 'Lucie',
  lastName: '',
  email: 'lucie@chezlulu.fr',
  phone: '06 12 34 56 78',
};

describe('prospectIssue — ce qui retient la création d’une enseigne', () => {
  it('complète, nom de famille omis : rien ne retient', () => {
    expect(prospectIssue(COMPLETE)).toBe('');
  });

  it.each([
    ['enseigne', { enseigne: '  ' }, 'Indiquez le nom de l’enseigne.'],
    ['prénom', { firstName: '' }, 'Indiquez le prénom du contact.'],
    ['e-mail', { email: 'lucie@' }, 'Indiquez une adresse e-mail valide pour le contact.'],
    ['téléphone', { phone: ' ' }, 'Indiquez le téléphone du contact.'],
  ])('sans %s : le dit', (_label, change, expected) => {
    expect(prospectIssue({ ...COMPLETE, ...change })).toBe(expected);
  });
});
