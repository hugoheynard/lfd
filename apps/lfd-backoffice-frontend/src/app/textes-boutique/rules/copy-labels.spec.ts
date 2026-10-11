import { describe, expect, it } from 'vitest';

import { entryView } from '../shop-copy.testing';
import { copyName, groupEntries, groupTitle } from './copy-labels';

const name = (key: string) => copyName(entryView(key, key.split('.')[0] ?? '', 'x'));

describe('copy-labels — un nom lisible pour chaque clé', () => {
  it('traduit le dernier segment connu', () => {
    expect(name('accueilPublic.hello.kicker')).toEqual({ label: 'Surtitre', group: 'hello' });
    expect(name('accueilPublic.title').label).toBe('Titre');
    expect(name('cart.lede').label).toBe('Chapô');
    expect(name('pay.placeholder').label).toBe('Exemple dans le champ');
  });

  it('lit deux segments quand le dernier seul ne dit rien', () => {
    expect(name('deliveryAddress.free.empty.title')).toEqual({
      label: 'Vide — titre',
      group: 'free',
    });
  });

  it('se replie sur un rôle en fin de nom, puis sur les mots du segment', () => {
    expect(name('commande.pickupTitle').label).toBe('Titre — pickup');
    expect(name('account.identitySiren').label).toBe('Identity siren');
    expect(name('proAccount.door.proof.1').label).toBe('Élément 2');
  });

  it('dit les groupes en clair', () => {
    expect(groupTitle('doors.pickup')).toBe('Doors › pickup');
    expect(groupTitle('contactFields')).toBe('Contact fields');
  });

  it('range par groupe, la racine de l’espace d’abord, dans l’ordre du recueil', () => {
    const groups = groupEntries([
      entryView('a.hello.title', 'a', 'x'),
      entryView('a.kicker', 'a', 'x'),
      entryView('a.hello.cta', 'a', 'x'),
    ]);
    expect(groups.map((group) => [group.title, group.entries.length])).toEqual([
      ['', 1],
      ['Hello', 2],
    ]);
  });
});
