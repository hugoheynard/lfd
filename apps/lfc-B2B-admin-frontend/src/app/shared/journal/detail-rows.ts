import { keyLabel } from './key-labels';
import { recordOf, type Payload } from './payload-read';
import { payloadNode, resolve, type SchemaNode } from './schema-node';
import { formatNumber, formatUnit } from './units';

/**
 * **Le détail sous une phrase : tout ce qu'elle n'a pas dit** (D4 du plan
 * `documentation/journalisation/plan-phrases-du-journal.md`).
 *
 * La phrase dit l'essentiel et déclare les clés qu'elle a consommées ; tout le
 * reste de la charge est rendu ici, clé par clé, **d'après le schéma qui la
 * valide** — la forme courante, ou la forme ancienne sous laquelle la ligne a
 * été écrite. Le schéma donne l'unité (un prix en euros, un taux en %), l'objet
 * cité (son nom du moment) et l'identifiant nu (« (identifiant …) »).
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

/** Aucun, rien, vide : une absence se dit, elle ne se tait pas. */
const NONE = 'aucun';

/**
 * Les conteneurs qui ne sont qu'un regroupement : leurs clés se lisent sans
 * leur préfixe. « Modifications › Nom » n'apprend rien que « Nom : A → B » ne
 * dise déjà.
 */
const TRANSPARENT = new Set(['changes']);

interface Walk {
  readonly unlabelled: Set<string>;
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
  const walk: Walk = { unlabelled: new Set() };
  const node = payloadNode(type, payload);
  const resolved = node === null ? null : resolve(node, payload);
  const rows =
    resolved?.kind === 'object'
      ? objectRows(null, resolved, payload, walk, said)
      : options.raw
        ? rawRows(payload, said)
        : [];
  return { rows, unlabelled: [...walk.unlabelled].sort() };
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
    return rows(prefix === null ? label : `${prefix} › ${label}`, child, field, walk);
  });
}

function rows(label: string, node: SchemaNode, value: unknown, walk: Walk): DetailRow[] {
  const resolved = resolve(node, value);
  switch (resolved.kind) {
    case 'maybe':
      return value === null || value === undefined
        ? [{ label, value: NONE }]
        : rows(label, resolved.inner, value, walk);
    case 'object': {
      const record = recordOf(value);
      if (record === null) {
        return [{ label, value: raw(value) }];
      }
      const special = specialForm(resolved, record, walk);
      return special === null
        ? objectRows(label, resolved, record, walk)
        : [{ label, value: special }];
    }
    case 'record': {
      const record = recordOf(value);
      if (record === null || Object.keys(record).length === 0) {
        return [{ label, value: record === null ? raw(value) : NONE }];
      }
      // Les clés d'un `record` sont des données (un contexte de vente, une
      // option) : elles se lisent telles quelles.
      return Object.entries(record).flatMap(([key, item]) =>
        rows(`${label} › ${key}`, resolved.value, item, walk),
      );
    }
    default:
      return [{ label, value: inline(resolved, value, walk) }];
  }
}

/** Une valeur sur une ligne : ce qu'un objet imbriqué, une liste, un scalaire deviennent. */
function inline(node: SchemaNode, value: unknown, walk: Walk): string {
  const resolved = resolve(node, value);
  switch (resolved.kind) {
    case 'maybe':
      return value === null || value === undefined ? NONE : inline(resolved.inner, value, walk);
    case 'object': {
      const record = recordOf(value);
      if (record === null) {
        return raw(value);
      }
      return specialForm(resolved, record, walk) ?? genericObject(resolved, record, walk);
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
      return value.map((item: unknown) => inline(element, item, walk)).join(separator);
    }
    case 'record': {
      const record = recordOf(value);
      if (record === null) {
        return raw(value);
      }
      const parts = Object.entries(record).map(
        ([key, item]) => `${key} : ${inline(resolved.value, item, walk)}`,
      );
      return parts.length === 0 ? NONE : parts.join(' · ');
    }
    default:
      return scalar(resolved, value);
  }
}

function genericObject(
  node: Extract<SchemaNode, { kind: 'object' }>,
  value: Payload,
  walk: Walk,
): string {
  const parts = node.fields.flatMap(([key, child]) => {
    const field = value[key];
    return field === undefined ? [] : [`${labelOf(key, walk)} : ${inline(child, field, walk)}`];
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
): string | null {
  const fields = new Map(node.fields);
  const keys = [...fields.keys()].sort().join(',');
  const from = fields.get('from');
  const to = fields.get('to');
  if (keys === 'from,to' && from !== undefined && to !== undefined) {
    return `${inline(from, value['from'], walk)} → ${inline(to, value['to'], walk)}`;
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

function scalar(node: SchemaNode, value: unknown): string {
  if (value === null || value === undefined) {
    return NONE;
  }
  switch (node.kind) {
    case 'string':
      if (node.unit !== null) {
        return formatUnit(node.unit, value) ?? raw(value);
      }
      // Un identifiant nu : dit comme tel, jamais déguisé en nom (D5).
      return node.ref !== null && typeof value === 'string' ? `(identifiant ${value})` : raw(value);
    case 'number':
      return node.unit === null ? raw(value) : (formatUnit(node.unit, value) ?? raw(value));
    default:
      return raw(value);
  }
}

/** Une valeur hors schéma, lisible quand même. */
function raw(value: unknown): string {
  if (value === null || value === undefined) {
    return NONE;
  }
  if (typeof value === 'string') {
    return value.trim() === '' ? '(vide)' : value;
  }
  if (typeof value === 'number') {
    return formatNumber(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'oui' : 'non';
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? NONE : value.map(raw).join(', ');
  }
  const record = recordOf(value);
  if (record === null) {
    return String(value);
  }
  const parts = Object.entries(record).map(
    ([key, item]) => `${keyLabel(key) ?? key} : ${raw(item)}`,
  );
  return parts.length === 0 ? NONE : parts.join(' · ');
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
