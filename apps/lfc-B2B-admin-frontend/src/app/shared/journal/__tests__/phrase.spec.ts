import { describe, expect, it } from 'vitest';

import {
  byActor,
  changedKeys,
  cite,
  citePerson,
  countOf,
  fieldList,
  fromTo,
  inSentence,
  inUnit,
  name,
  plain,
  text,
  valueIn,
  whatChanged,
  type Noun,
  type PhraseFact,
} from '../phrase';
import { SALES_CONTEXT } from '../values/referential-values';

/**
 * **Les briques communes des phrases** (plan des phrases du journal, lot D) :
 * ce que les lots de phrases partagent, écrit une fois pour qu'aucun n'ait à
 * toucher `phrase.ts`.
 */

const FAMILY: Noun = { the: 'la famille', a: 'une famille' };

const FACT: PhraseFact = {
  type: 'product_category.renamed',
  payload: {},
  subjectType: 'product_category',
  subjectId: 'cat_1',
  actor: 'Colette Martin',
};

describe('cite — un objet cité par la charge', () => {
  it('le nomme sous son nom du moment, en gras entre guillemets', () => {
    const segments = cite(FAMILY, { id: 'cat_1', name: 'Tartes' });

    expect(plain(segments)).toBe('la famille « Tartes »');
    expect(segments).toContainEqual(name('Tartes'));
  });

  it('se passe d’article quand on le lui demande', () => {
    expect(plain(cite({ the: '', a: 'un taux' }, { id: 'tva_1', name: 'Réduit' }))).toBe(
      '« Réduit »',
    );
  });

  it('lit le français d’un nom traduisible', () => {
    expect(plain(cite(FAMILY, { id: 'cat_1', name: { fr: 'Tartes', en: 'Pies' } }))).toBe(
      'la famille « Tartes »',
    );
  });

  it('dit l’identifiant d’une ligne d’avant le lot B, sans inventer de nom (D5)', () => {
    expect(plain(cite(FAMILY, 'cat_01J'))).toBe('une famille (identifiant cat_01J)');
    expect(plain(cite(FAMILY, { id: 'cat_01J' }))).toBe('une famille (identifiant cat_01J)');
  });

  it('se contente du nom commun quand la charge ne cite rien', () => {
    expect(plain(cite(FAMILY, null))).toBe('une famille');
  });
});

describe('citePerson — une personne citée', () => {
  it('nomme un membre de l’équipe par son prénom et son nom, sans guillemets', () => {
    expect(plain(citePerson({ firstName: 'Cécile', lastName: 'Martin' }))).toBe('Cécile Martin');
  });

  it('nomme une personne citée `{ id, name }`', () => {
    expect(plain(citePerson({ id: 'usr_1', name: 'Jean Dupont' }))).toBe('Jean Dupont');
  });

  it('dit l’identifiant d’une personne sans nom — jamais une coordonnée', () => {
    expect(plain(citePerson({ id: 'usr_1' }, 'un contact'))).toBe('un contact (identifiant usr_1)');
    expect(plain(citePerson(null))).toBe('une personne');
  });
});

describe('les valeurs mises en forme', () => {
  it('met une valeur dans son unité, et rend « — » pour une forme inattendue', () => {
    expect(inUnit('cents', 1250).text).toMatch(/^12,50\s€$/u);
    expect(inUnit('day', '2026-09-19').text).toBe('19 septembre 2026');
    expect(inUnit('percent', 'dix')).toEqual({ kind: 'value', text: '—' });
  });

  it('compte au singulier jusqu’à un, au pluriel au-delà', () => {
    expect(countOf(0, 'article', 'articles')?.text).toBe('0 article');
    expect(countOf(1, 'article', 'articles')?.text).toBe('1 article');
    expect(countOf(12, 'famille', 'familles')?.text).toBe('12 familles');
    expect(countOf(null, 'famille', 'familles')).toBeNull();
  });

  it('dit une valeur d’ensemble fermé par son mot, et une inconnue telle quelle', () => {
    expect(valueIn(SALES_CONTEXT, 'takeaway').text).toBe('À emporter');
    expect(valueIn(SALES_CONTEXT, 'brunch').text).toBe('brunch');
    expect(valueIn(SALES_CONTEXT, undefined).text).toBe('—');
    expect(valueIn(SALES_CONTEXT, 'takeaway', { inSentence: true }).text).toBe('à emporter');
  });

  it('dit un avant → après en une expression', () => {
    expect(plain(fromTo([text('5,5 %')], [text('10 %')]))).toBe('de 5,5 % à 10 %');
  });
});

describe('ce qui a changé', () => {
  it('liste les champs d’un diff dans leur ordre, en mots', () => {
    const changes = {
      name: { from: { fr: 'A' }, to: { fr: 'B' } },
      descriptionShort: { from: null, to: { fr: 'Courte' } },
      categoryId: undefined,
    };

    expect(changedKeys(changes)).toEqual(['name', 'descriptionShort']);
    expect(plain(whatChanged(changes))).toBe(' : nom, description courte');
  });

  it('dit qu’un diff vide ne change rien', () => {
    expect(plain(whatChanged({}))).toBe(' (aucun changement)');
    expect(plain(whatChanged(null))).toBe(' (aucun changement)');
  });

  it('nomme les champs d’une fiche client, qui ne sont pas des clés de charge', () => {
    expect(fieldList(['vatNumber', 'siret', 'inconnu'])).toBe('numéro de TVA, SIRET, inconnu');
  });

  it('baisse la première lettre d’un libellé en milieu de phrase, pas celle d’un sigle', () => {
    expect(inSentence('À emporter')).toBe('à emporter');
    expect(inSentence('Description courte')).toBe('description courte');
    expect(inSentence('SIRET')).toBe('SIRET');
    expect(inSentence('B2B')).toBe('B2B');
    expect(inSentence('')).toBe('');
  });
});

describe('byActor — l’auteur en sujet', () => {
  it('ouvre la phrase sur l’auteur et le déclare nommé', () => {
    const said = byActor(
      FACT,
      [text('a renommé '), ...cite(FAMILY, { id: 'c', name: 'T' })],
      ['changes'],
    );

    expect(plain(said.segments)).toBe('Colette Martin a renommé la famille « T »');
    expect(said.namesActor).toBe(true);
    expect(said.consumed).toEqual(['changes']);
  });
});
