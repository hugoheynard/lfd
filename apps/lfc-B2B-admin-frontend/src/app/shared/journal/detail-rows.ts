import { keyLabel } from './key-labels';
import { recordOf, type Payload } from './payload-read';
import { payloadNode, resolve, type SchemaNode } from './schema-node';
import {
  closedStringText,
  enumText,
  literalText,
  NONE,
  raw,
  recordKeyText,
  type Field,
} from './detail-values';
import { formatUnit } from './units';

/**
 * **Le détail sous une phrase : tout ce qu'elle n'a pas dit** (D4 du plan
 * `documentation/journalisation/plan-phrases-du-journal.md`).
 *
 * La phrase dit l'essentiel et déclare les clés qu'elle a consommées ; tout le
 * reste de la charge est rendu ici, clé par clé, **d'après le schéma qui la
 * valide** — la forme courante, ou la forme ancienne sous laquelle la ligne a
 * été écrite. Le schéma donne l'unité (un prix en euros, un taux en %), l'objet
 * cité (son nom du moment) et l'identifiant nu (« (identifiant …) »). Une
 * valeur prise dans un ensemble fermé — une énumération, un littéral, la clé
 * d'un record — se dit par le dictionnaire des valeurs (`values/`), jamais par
 * son code.
 *
 * Une charge qu'aucune forme n'accepte n'est pas une erreur : elle est rendue
 * brute, clé par clé, avec les libellés qu'on connaît. Le journal ne se
 * réécrit pas, et une ligne mal formée reste une ligne à lire.
 */

/** Une ligne du détail : « Prix HT » — « 8,18182 € ». */
export interface DetailRow {
  readonly label: string;
  readonly value: string;
}

export interface DetailOfFact {
  readonly rows: readonly DetailRow[];
  /**
   * Les clés rencontrées sans libellé au dictionnaire — affichées sous leur nom
   * technique. Vide en production si le test de clôture passe ; c'est lui qui
   * s'en sert.
   */
  readonly unlabelled: readonly string[];
  /**
   * Les valeurs d'ensemble fermé rendues sans libellé (`champ=valeur`) : une
   * énumération, un littéral ou une clé de record que le dictionnaire des
   * valeurs ne nomme pas. Même rôle que `unlabelled`, pour la colonne de droite.
   */
  readonly unlabelledValues: readonly string[];
}

/** Ce que le détail tait de toute façon, et pourquoi il le tait. */
export interface DetailOptions {
  /**
   * `false` : une charge hors schéma n'est PAS rendue brute. Pour les faits dont
   * le contenu ne doit être lisible nulle part (les notes du commercial, D6 de
   * leur plan) : leur schéma garantit qu'aucun contenu n'y entre, et une charge
   * qui n'y répond pas ne doit pas le faire entrer par le détail.
   */
  readonly raw: boolean;
}

/**
 * Les conteneurs qui ne sont qu'un regroupement : leurs clés se lisent sans
 * leur préfixe. « Modifications › Nom » n'apprend rien que « Nom : A → B » ne
 * dise déjà.
 */
const TRANSPARENT = new Set(['changes']);

interface Walk {
  readonly unlabelled: Set<string>;
  readonly unlabelledValues: Set<string>;
}

/**
 * Le détail d'un fait : les clés de sa charge que la phrase n'a pas dites,
 * dans l'ordre du schéma.
 */
export function factDetail(
  type: string,
  payload: Payload,
  said: ReadonlySet<string>,
  options: DetailOptions = { raw: true },
): DetailOfFact {
  const walk: Walk = { unlabelled: new Set(), unlabelledValues: new Set() };
  const node = payloadNode(type, payload);
  const resolved = node === null ? null : resolve(node, payload);
  const rows =
    resolved?.kind === 'object'
      ? objectRows(null, resolved, payload, walk, said)
      : resolved?.kind === 'record'
        ? rootRecordRows(resolved, payload, walk, said)
        : options.raw
          ? rawRows(payload, said)
          : [];
  return {
    rows,
    unlabelled: [...walk.unlabelled].sort(),
    unlabelledValues: [...walk.unlabelledValues].sort(),
  };
}

function objectRows(
  prefix: string | null,
  node: Extract<SchemaNode, { kind: 'object' }>,
  value: Payload,
  walk: Walk,
  skip: ReadonlySet<string> = new Set(),
): DetailRow[] {
  return node.fields.flatMap(([key, child]) => {
    const field = value[key];
    if (field === undefined || skip.has(key)) {
      return [];
    }
    const label = labelOf(key, walk);
    if (TRANSPARENT.has(key)) {
      const inner = unwrap(child, field);
      const record = recordOf(field);
      if (inner.kind === 'object' && record !== null) {
        return objectRows(prefix, inner, record, walk);
      }
    }
    return rows(prefix === null ? label : `${prefix} › ${label}`, child, field, walk, key);
  });
}

function rows(
  label: string,
  node: SchemaNode,
  value: unknown,
  walk: Walk,
  field: Field,
): DetailRow[] {
  const resolved = resolve(node, value);
  switch (resolved.kind) {
    case 'maybe':
      return value === null || value === undefined
        ? [{ label, value: NONE }]
        : rows(label, resolved.inner, value, walk, field);
    case 'object': {
      const record = recordOf(value);
      if (record === null) {
        return [{ label, value: raw(value) }];
      }
      const special = specialForm(resolved, record, walk, field);
      return special === null
        ? objectRows(label, resolved, record, walk)
        : [{ label, value: special }];
    }
    case 'record': {
      const record = recordOf(value);
      if (record === null || Object.keys(record).length === 0) {
        return [{ label, value: record === null ? raw(value) : NONE }];
      }
      return Object.entries(record).flatMap(([key, item]) =>
        rows(
          `${label} › ${recordKeyText(field, key, walk.unlabelledValues)}`,
          resolved.value,
          item,
          walk,
          field,
        ),
      );
    }
    default:
      return [{ label, value: inline(resolved, value, walk, field) }];
  }
}

/** Une valeur sur une ligne : ce qu'un objet imbriqué, une liste, un scalaire deviennent. */
function inline(node: SchemaNode, value: unknown, walk: Walk, field: Field): string {
  const resolved = resolve(node, value);
  switch (resolved.kind) {
    case 'maybe':
      return value === null || value === undefined
        ? NONE
        : inline(resolved.inner, value, walk, field);
    case 'object': {
      const record = recordOf(value);
      if (record === null) {
        return raw(value);
      }
      return specialForm(resolved, record, walk, field) ?? genericObject(resolved, record, walk);
    }
    case 'array': {
      if (!Array.isArray(value)) {
        return raw(value);
      }
      if (value.length === 0) {
        return NONE;
      }
      const element = resolved.element;
      const separator = isComposite(element) ? ' ; ' : ', ';
      return value.map((item: unknown) => inline(element, item, walk, field)).join(separator);
    }
    case 'record': {
      const record = recordOf(value);
      if (record === null) {
        return raw(value);
      }
      const parts = Object.entries(record).map(
        ([key, item]) =>
          `${recordKeyText(field, key, walk.unlabelledValues)} : ${inline(resolved.value, item, walk, field)}`,
      );
      return parts.length === 0 ? NONE : parts.join(' · ');
    }
    default:
      return scalar(resolved, value, walk, field);
  }
}

function genericObject(
  node: Extract<SchemaNode, { kind: 'object' }>,
  value: Payload,
  walk: Walk,
): string {
  const parts = node.fields.flatMap(([key, child]) => {
    const field = value[key];
    return field === undefined
      ? []
      : [`${labelOf(key, walk)} : ${inline(child, field, walk, key)}`];
  });
  return parts.length === 0 ? NONE : parts.join(' · ');
}

/**
 * Les formes que le catalogue emploie partout, et qui se lisent d'un mot :
 *
 * - `{ from, to }` — « avant → après » ;
 * - `{ id, name }` — l'objet cité sous son nom du moment ; sans nom (une
 *   personne qui n'en porte pas), « (identifiant …) » — jamais un nom inventé ;
 * - `{ id, ville, codePostal }` — une adresse citée par son lieu ;
 * - `{ fr, en?, it? }` — un texte traduisible, le français faisant foi ;
 * - `{ firstName, lastName }` — une personne de l'équipe.
 */
function specialForm(
  node: Extract<SchemaNode, { kind: 'object' }>,
  value: Payload,
  walk: Walk,
  field: Field,
): string | null {
  const fields = new Map(node.fields);
  const keys = [...fields.keys()].sort().join(',');
  const from = fields.get('from');
  const to = fields.get('to');
  if (keys === 'from,to' && from !== undefined && to !== undefined) {
    return `${inline(from, value['from'], walk, field)} → ${inline(to, value['to'], walk, field)}`;
  }
  if (keys === 'id,name') {
    return typeof value['name'] === 'string' && value['name'] !== ''
      ? value['name']
      : `(identifiant ${raw(value['id'])})`;
  }
  if (keys === 'codePostal,id,ville') {
    return `${raw(value['codePostal'])} ${raw(value['ville'])}`;
  }
  if (keys === 'en,fr,it') {
    return localized(value);
  }
  if (keys === 'firstName,lastName') {
    const name = [value['firstName'], value['lastName']]
      .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
      .join(' ');
    return name === '' ? '(vide)' : name;
  }
  return null;
}

/** « Tarte citron (anglais : Lemon tart) » — le français d'abord, les autres s'ils existent. */
function localized(value: Payload): string {
  const fr = typeof value['fr'] === 'string' && value['fr'] !== '' ? value['fr'] : '(vide)';
  const others = (
    [
      ['en', 'anglais'],
      ['it', 'italien'],
    ] as const
  ).flatMap(([key, language]) => {
    const text = value[key];
    return typeof text === 'string' && text !== '' ? [`${language} : ${text}`] : [];
  });
  return others.length === 0 ? fr : `${fr} (${others.join(', ')})`;
}

function scalar(node: SchemaNode, value: unknown, walk: Walk, field: Field): string {
  if (value === null || value === undefined) {
    return NONE;
  }
  switch (node.kind) {
    case 'string':
      if (node.unit !== null) {
        return formatUnit(node.unit, value) ?? raw(value);
      }
      // Un identifiant nu : dit comme tel, jamais déguisé en nom (D5).
      if (node.ref !== null && typeof value === 'string') {
        return `(identifiant ${value})`;
      }
      return closedStringText(field, value);
    case 'number':
      return node.unit === null ? raw(value) : (formatUnit(node.unit, value) ?? raw(value));
    case 'enum':
      return enumText(node.values, value, field, walk.unlabelledValues);
    case 'literal':
      return literalText(value, field, walk.unlabelledValues);
    default:
      return raw(value);
  }
}

/**
 * Une charge qui EST un record (le taux par contexte du lot A) : une ligne par
 * clé, sous le mot de la clé — « À emporter : Réduit → Normal ».
 */
function rootRecordRows(
  node: Extract<SchemaNode, { kind: 'record' }>,
  payload: Payload,
  walk: Walk,
  said: ReadonlySet<string>,
): DetailRow[] {
  return Object.entries(payload)
    .filter(([key]) => !said.has(key))
    .flatMap(([key, item]) =>
      rows(recordKeyText(null, key, walk.unlabelledValues), node.value, item, walk, null),
    );
}

/** Une charge qu'aucune forme n'accepte : clé par clé, sous le libellé qu'on connaît. */
function rawRows(payload: Payload, said: ReadonlySet<string>): DetailRow[] {
  return Object.entries(payload)
    .filter(([key, value]) => !said.has(key) && value !== undefined)
    .map(([key, value]) => ({ label: keyLabel(key) ?? key, value: raw(value) }));
}

function labelOf(key: string, walk: Walk): string {
  const label = keyLabel(key);
  if (label === null) {
    walk.unlabelled.add(key);
    return key;
  }
  return label;
}

/** Le nœud sous un facultatif, et la branche d'union qui accepte la valeur. */
function unwrap(node: SchemaNode, value: unknown): SchemaNode {
  const resolved = resolve(node, value);
  return resolved.kind === 'maybe' ? unwrap(resolved.inner, value) : resolved;
}

function isComposite(node: SchemaNode): boolean {
  const kind = node.kind === 'maybe' ? node.inner.kind : node.kind;
  return kind === 'object' || kind === 'array' || kind === 'record' || kind === 'union';
}
