import type { JournalUnit } from '@lfd/contracts/journal-facts';

import { keyLabel } from './key-labels';
import type { Payload } from './payload-read';
import { optional, recordOf } from './payload-read';
import { subjectRoute } from './subject-routes';
import { formatCount, formatUnit } from './units';
import { labelIn, stringDomain, type ValueDomain } from './values';

/**
 * **Une phrase du journal, en segments** (D3 du plan
 * `documentation/journalisation/plan-phrases-du-journal.md`).
 *
 * Une phrase ne rend pas une chaîne : elle rend des segments — du texte, un nom
 * en gras, une valeur mise en forme, le sujet (lié à sa fiche quand une route
 * existe). C'est ce qui permet le gras et le lien **sans `innerHTML`** : le
 * gabarit rend chaque segment par son propre élément.
 *
 * Et elle déclare les clés de la charge qu'elle a **dites** (`consumed`) : le
 * détail sous la phrase rend tout le reste (D4). Une clé ni dite ni rendue
 * serait perdue — c'est ce que le test de clôture interdit.
 */
export type Segment =
  | { readonly kind: 'text'; readonly text: string }
  /** Un nom, en gras : une personne, une famille, un taux. */
  | { readonly kind: 'name'; readonly text: string }
  /** Une valeur mise en forme : un montant, un taux, une heure. */
  | { readonly kind: 'value'; readonly text: string }
  /** Le sujet de la ligne, en gras — et un lien vers sa fiche quand `route` existe. */
  | { readonly kind: 'subject'; readonly text: string; readonly route: string | null };

/** Ce qu'une phrase reçoit d'un fait. */
export interface PhraseFact {
  readonly type: string;
  readonly payload: Payload;
  readonly subjectType: string;
  readonly subjectId: string;
  /**
   * L'auteur tel qu'une phrase à la voix active le nomme en tête : le nom figé
   * à l'acte (« Hugo Heynard »), sinon sa nature (« Un membre de l'équipe »).
   */
  readonly actor: string;
}

/** Ce qu'une phrase rend. */
export interface Said {
  /** Le geste, en titre au-dessus de la phrase (« Changement de rôle ») ; `null` s'il n'y en a pas. */
  readonly title: string | null;
  readonly segments: readonly Segment[];
  /** Les clés de la charge que la phrase a dites : le détail rend les autres. */
  readonly consumed: readonly string[];
  /** Vrai quand la phrase nomme déjà l'auteur : la ligne ne répète pas « par … ». */
  readonly namesActor: boolean;
}

/** Une phrase : un fait → ce qu'il dit. */
export type Phrase = (fact: PhraseFact) => Said;

export function text(value: string): Segment {
  return { kind: 'text', text: value };
}

export function name(value: string): Segment {
  return { kind: 'name', text: value };
}

export function value(formatted: string): Segment {
  return { kind: 'value', text: formatted };
}

/** Le sujet sous ce libellé, lié à sa fiche quand l'écran en a une. */
export function subject(fact: PhraseFact, label: string): Segment {
  return { kind: 'subject', text: label, route: subjectRoute(fact.subjectType, fact.subjectId) };
}

/** Le libellé du sujet figé à l'écriture (D6), ou `null` s'il n'en porte pas. */
export function subjectLabelOf(fact: PhraseFact): string | null {
  return optional(fact.payload['subjectLabel']);
}

/** Une phrase à la troisième personne, sans titre, qui ne nomme pas l'auteur. */
export function said(segments: readonly Segment[], consumed: readonly string[]): Said {
  return { title: null, segments, consumed, namesActor: false };
}

/**
 * Une phrase à la voix active, l'auteur en sujet : « Colette Martin » + `rest`.
 * `fact.actor` est toujours un sujet valable — le nom figé à l'acte, sinon la
 * nature de l'auteur (« Un membre de l'équipe ») — et la ligne ne répète pas
 * « par … » ensuite.
 */
export function byActor(
  fact: PhraseFact,
  rest: readonly Segment[],
  consumed: readonly string[],
): Said {
  return { title: null, segments: [text(`${fact.actor} `), ...rest], consumed, namesActor: true };
}

/** Comment un objet cité se dit, avec son article défini (`the`) et indéfini (`a`). */
export interface Noun {
  /** « la famille » — devant un nom. */
  readonly the: string;
  /** « une famille » — quand la ligne ne porte que l'identifiant, ou rien. */
  readonly a: string;
}

/**
 * Un objet cité par la charge — `named`, `namedOrBare` ou `ref` au catalogue
 * (D5 du plan) :
 *
 * - `{ id, name }` → « la famille « Tartes » », le nom en gras ;
 * - un identifiant nu, ou `{ id }` sans nom → « une famille (identifiant
 *   cat_1) » — les lignes d'avant le lot B, dont on n'invente pas le nom ;
 * - rien → « une famille ».
 *
 * ⚠️ Une chaîne est toujours lue comme un IDENTIFIANT : c'est ce qu'un champ
 * `ref` porte. Un champ qui porte un nom en clair (`label`, `name`) se dit par
 * `name()`, pas par `cite()`.
 */
export function cite(noun: Noun, cited: unknown): Segment[] {
  const called = citedName(cited);
  if (called !== null) {
    // Sans article (`the: ''`) : « « Réduit » », pas « ␣« Réduit » ».
    return [text(noun.the === '' ? '« ' : `${noun.the} « `), name(called), text(' »')];
  }
  const id = citedId(cited);
  return [text(id === null ? noun.a : `${noun.a} (identifiant ${id})`)];
}

/**
 * Une personne citée, sans guillemets : `{ id, name? }` (un contact, un
 * détenteur, la fiche staff qui a colisé) ou `{ firstName, lastName }` (un
 * membre de l'équipe). Sans nom, « `someone` (identifiant …) » — jamais
 * l'e-mail, qui n'entre pas au journal.
 */
export function citePerson(cited: unknown, someone = 'une personne'): Segment[] {
  const record = recordOf(cited);
  const parts =
    record === null ? [] : [optional(record['firstName']), optional(record['lastName'])];
  const full = parts.filter((part): part is string => part !== null).join(' ');
  const called = full === '' ? citedName(cited) : full;
  if (called !== null) {
    return [name(called)];
  }
  const id = citedId(cited);
  return [text(id === null ? someone : `${someone} (identifiant ${id})`)];
}

/** Le nom d'un objet cité (`{ name }`, ou un texte traduisible sous `name`), ou `null`. */
export function citedName(cited: unknown): string | null {
  const record = recordOf(cited);
  if (record === null) {
    return null;
  }
  const called = record['name'];
  return optional(called) ?? optional(recordOf(called)?.['fr']);
}

function citedId(cited: unknown): string | null {
  return optional(cited) ?? optional(recordOf(cited)?.['id']);
}

/**
 * Une valeur dans son unité, en valeur mise en forme : un montant
 * (`cents`, `millicents`), un taux (`percent`, `basisPoints`), une date
 * (`instant` → « 19 septembre 2026 à 10:00 », `day` → « 19 septembre 2026 »),
 * une durée. `—` si la charge ne porte pas la forme attendue — jamais `NaN`.
 *
 * L'unité se lit au catalogue (`fact.ts` : `cents()`, `day()`…), jamais au nom
 * de la clé.
 */
export function inUnit(unit: JournalUnit, raw: unknown): Segment {
  return value(formatUnit(unit, raw) ?? '—');
}

/** « 12 familles », « 1 article » — `null` si la charge n'a pas figé de compte. */
export function countOf(raw: unknown, singular: string, plural: string): Segment | null {
  return typeof raw === 'number' ? value(formatCount(raw, singular, plural)) : null;
}

/**
 * Une valeur d'ensemble fermé, par son mot (`values/`) : `write` → « Écriture ».
 * Une valeur que l'ensemble ne connaît pas se dit telle quelle, `—` si elle
 * manque. `inSentence: true` en milieu de phrase : « à emporter », « actif ».
 */
export function valueIn(
  set: ValueDomain,
  raw: unknown,
  options: { readonly inSentence: boolean } = { inSentence: false },
): Segment {
  const word = labelIn(set, raw) ?? optional(raw) ?? '—';
  return value(options.inSentence ? inSentence(word) : word);
}

/**
 * « de 5,5 % à 10 % » — un avant → après dans une phrase. Les deux côtés sont
 * déjà des segments : c'est à l'appelant de dire ce qu'un côté vide devient
 * (« aucun », « la famille »), le français ne tolère pas de règle unique.
 */
export function fromTo(before: readonly Segment[], after: readonly Segment[]): Segment[] {
  return [text('de '), ...before, text(' à '), ...after];
}

/** Ce qu'une modification qui ne change rien dit d'elle-même. */
export const NO_CHANGE = 'aucun changement';

/**
 * « : nom, description courte » — les champs d'un diff (`changes` au
 * catalogue), dans leur ordre ; « (aucun changement) » quand il est vide. Les
 * valeurs, elles, restent au détail : une phrase ne récite pas un formulaire.
 */
export function whatChanged(changes: unknown): Segment[] {
  const keys = changedKeys(changes);
  return [text(keys.length === 0 ? ` (${NO_CHANGE})` : ` : ${fieldList(keys)}`)];
}

/** Les clés présentes d'un diff : chaque clé changée porte son avant et son après, les autres sont absentes. */
export function changedKeys(changes: unknown): readonly string[] {
  const record = recordOf(changes);
  return record === null
    ? []
    : Object.keys(record).filter((key) => record[key] !== undefined && record[key] !== null);
}

/**
 * « nom, description courte, SIRET » — des noms de champs, dits en mots : par
 * le dictionnaire des clés d'abord (`categoryId` → « famille »), par celui des
 * champs modifiés ensuite (`fields` d'une fiche client : `vatNumber` →
 * « numéro de TVA »), tels quels en dernier recours.
 */
export function fieldList(keys: readonly string[]): string {
  const fields = stringDomain('fields');
  return keys
    .map((key) =>
      inSentence(keyLabel(key) ?? (fields === null ? null : labelIn(fields, key)) ?? key),
    )
    .join(', ');
}

/**
 * Un libellé repris en milieu de phrase : « Description courte » →
 * « description courte », « À emporter » → « à emporter ». Un sigle garde ses
 * capitales (« SIRET », « KBIS », « B2B ») : la première lettre ne baisse pas
 * devant une seconde majuscule, ni devant un chiffre.
 */
export function inSentence(label: string): string {
  const second = label.charAt(1);
  const acronym = /\p{Lu}|\p{N}/u.test(second);
  return acronym ? label : `${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

/** La phrase en texte suivi — pour la recherche, les tests, un lecteur d'écran. */
export function plain(segments: readonly Segment[]): string {
  return segments.map((segment) => segment.text).join('');
}

/** Qui agissait, dans la forme que le contrat sert. */
export type ActorType = 'staff' | 'customer' | 'system';

/**
 * L'auteur sans nom, dit par sa NATURE, en tête de phrase. Un `Record`
 * exhaustif : une nature ajoutée au contrat ne compile pas tant qu'elle n'a pas
 * sa tournure ici. Jamais le `sub` ni l'id de sa fiche, qui ne diraient rien à
 * celui qui lit.
 */
const UNNAMED_ACTORS: Readonly<Record<ActorType, string>> = {
  staff: 'Un membre de l’équipe',
  system: 'Le système',
  customer: 'Un client',
};

/** Les mêmes, après « par » : « …, par un membre de l'équipe ». */
const UNNAMED_AUTHORS: Readonly<Record<ActorType, string>> = {
  staff: 'un membre de l’équipe',
  system: 'le système',
  customer: 'un client',
};

/** L'auteur en sujet d'une phrase à la voix active. */
export function actorSubject(actorName: string | null, actorType: ActorType): string {
  return optional(actorName) ?? UNNAMED_ACTORS[actorType];
}

/**
 * L'auteur après « par ». La fonction entre parenthèses quand elle est connue :
 * « qui a fait ça, et à quel titre » est la question qu'on pose à un journal.
 */
export function actorBy(
  actorName: string | null,
  actorRole: string | null,
  actorType: ActorType,
): string {
  const name = optional(actorName);
  if (name === null) {
    return UNNAMED_AUTHORS[actorType];
  }
  const role = optional(actorRole);
  return role === null ? name : `${name} (${role})`;
}
