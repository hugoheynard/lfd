import { describe, expect, it } from 'vitest';

import manifest from '../../../../../lfc-ecommerce-frontend/src/app/client/copy/shop-copy-manifest.json';
import { entryView } from '../shop-copy.testing';
import { copyName, groupEntries, groupTitle, knownSegmentLabel } from './copy-labels';

const name = (key: string) => copyName(entryView(key, key.split('.')[0] ?? '', 'x'));

/** Toutes les clés du manifeste, avec leur espace. */
const ALL_KEYS = manifest.spaces.flatMap((space) =>
  space.entries.map((entry) => ({ key: entry.key, space: space.space })),
);

/** Un identifiant resté brut : un mot collé en camelCase ou relié par `_`. */
const RAW_IDENTIFIER = /[a-z][A-Z]|_/u;

/** Les noms propres admis malgré leur casse : ils ne sont pas des identifiants. */
const PROPER_NAMES = /\biOS\b/gu;

const looksRaw = (text: string): boolean => RAW_IDENTIFIER.test(text.replace(PROPER_NAMES, ''));

describe('copy-labels — un nom lisible pour chaque clé', () => {
  it('traduit le dernier segment connu', () => {
    expect(name('accueilPublic.hello.kicker')).toEqual({ label: 'Surtitre', group: 'hello' });
    expect(name('accueilPublic.title').label).toBe('Titre');
    expect(name('cart.lede').label).toBe('Texte d’introduction');
    expect(name('pay.placeholder').label).toBe('Exemple dans le champ');
  });

  it('lit deux segments quand le dernier seul ne dit rien', () => {
    expect(name('deliveryAddress.free.empty.title')).toEqual({
      label: 'Vide — titre',
      group: 'free',
    });
  });

  it('dit en français ce que le texte est', () => {
    expect(name('commande.pickupTitle').label).toBe('Retrait — titre');
    expect(name('account.identitySiren').label).toBe('Identité — SIREN');
    expect(name('accueilPublic.hello.titleAnonymous').label).toBe('Titre — sans prénom');
    expect(name('proAccount.door.proof.1').label).toBe('Élément 2');
  });

  it('nomme la pastille des incontournables, plus « meilleure vente » (2026-10-18)', () => {
    expect(name('product.bestSeller').label).toBe(
      'Pastille « incontournable » (article mis en avant)',
    );
  });

  it('distingue la limite courte de la vignette de la phrase de la fiche (2026-10-21)', () => {
    expect(name('product.madeToOrderShortEve').label).toBe(
      'Vignette du rayon — sur commande, la veille',
    );
    expect(name('product.madeToOrderEve').label).toBe('Fiche — préparé sur commande, la veille');
  });

  it('se replie encore sur un rôle en fin de nom, puis sur les mots du segment', () => {
    expect(name('x.inconnuTitle').label).toBe('Titre — inconnu');
    expect(name('x.inconnu').label).toBe('Inconnu');
  });

  it('dit les groupes en clair', () => {
    expect(groupTitle('doors.pickup')).toBe('Portes › Retrait');
    expect(groupTitle('hello.proPills')).toBe('Accueil personnalisé › Pastilles pro');
    expect(groupTitle('contactFields')).toBe('Fiche du contact');
  });

  it('range par groupe, la racine de l’espace d’abord, dans l’ordre du recueil', () => {
    const groups = groupEntries([
      entryView('a.hello.title', 'a', 'x'),
      entryView('a.kicker', 'a', 'x'),
      entryView('a.hello.cta', 'a', 'x'),
    ]);
    expect(groups.map((group) => [group.title, group.entries.length])).toEqual([
      ['', 1],
      ['Accueil personnalisé', 2],
    ]);
  });
});

describe('copy-labels — le glossaire couvre tout le manifeste', () => {
  it('connaît chaque segment de chaque clé (un texte ajouté sans libellé français échoue ici)', () => {
    const missing = new Set<string>();
    for (const { key, space } of ALL_KEYS) {
      const segments = key.split('.');
      const inner = segments[0] === space ? segments.slice(1) : segments;
      for (const segment of inner) {
        if (!/^\d+$/u.test(segment) && knownSegmentLabel(segment) === undefined) {
          missing.add(`${segment} (${key})`);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('ne montre aucun identifiant brut dans un libellé ni un intertitre', () => {
    const raw = ALL_KEYS.flatMap(({ key, space }) => {
      const { label, group } = copyName(entryView(key, space, 'x'));
      const title = group === '' ? '' : groupTitle(group);
      return looksRaw(label) || looksRaw(title) ? [`${key} → ${title} / ${label}`] : [];
    });
    expect(raw).toEqual([]);
  });
});
