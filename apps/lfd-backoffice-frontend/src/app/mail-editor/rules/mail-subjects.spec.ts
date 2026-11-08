import { describe, expect, it } from 'vitest';

import { mailSubjectDisplay } from './mail-subjects';

describe('mailSubjectDisplay', () => {
  it('fait d’une commande un lien vers sa fiche', () => {
    expect(mailSubjectDisplay({ type: 'order', id: 'cmd_1' })).toEqual({
      kind: 'link',
      label: 'Commande',
      path: ['/commandes', 'cmd_1'],
    });
  });

  it('dit les autres types en texte, avec un identifiant court', () => {
    expect(mailSubjectDisplay({ type: 'invoice', id: 'inv_01JABCDEFGHJKMNP' })).toEqual({
      kind: 'text',
      label: 'Facture …FGHJKMNP',
    });
  });

  it('garde tel quel un type inconnu', () => {
    expect(mailSubjectDisplay({ type: 'parcel', id: 'p_1' })).toEqual({
      kind: 'text',
      label: 'parcel p_1',
    });
  });
});
