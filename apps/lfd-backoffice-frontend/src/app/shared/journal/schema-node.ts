import {
  isJournalFactType,
  JOURNAL_UNITS,
  journalPayloadShapes,
  type JournalUnit,
} from '@lfd/contracts/journal-facts';

/**
 * **Ce que le moteur de phrases lit d'un schéma de charge** — sa forme, ses
 * unités, ses identifiants nus — sans importer zod.
 *
 * Le back-office ne dépend pas de zod, et n'a pas à en dépendre pour LIRE un
 * schéma : le catalogue (`@lfd/contracts/journal-facts`) le lui apporte déjà,
 * dans les seules routes paresseuses qui s'en servent. On en lit la structure
 * publique (`def`, `meta()`), une fois, et on la traduit dans l'arbre
 * ci-dessous — le seul que le reste du moteur connaisse.
 *
 * Chaque nœud garde son schéma d'origine : une union se départage en
 * **validant** la valeur contre chacune de ses branches, comme la charge
 * elle-même se départage entre sa forme courante et ses formes anciennes.
 */

/** Un schéma de charge, tel que le catalogue le rend. */
export type PayloadShape = ReturnType<typeof journalPayloadShapes>[number];

interface Validates {
  /** Le schéma accepte-t-il cette valeur ? */
  readonly accepts: (value: unknown) => boolean;
}

export type SchemaNode = Validates &
  (
    | { readonly kind: 'object'; readonly fields: readonly (readonly [string, SchemaNode])[] }
    /** Facultatif ou nullable : la valeur peut manquer, ou valoir `null`. */
    | { readonly kind: 'maybe'; readonly inner: SchemaNode }
    | { readonly kind: 'array'; readonly element: SchemaNode }
    /** Des clés de DONNÉE (un contexte de vente, une option) : elles n'ont pas de libellé. */
    | { readonly kind: 'record'; readonly value: SchemaNode }
    | { readonly kind: 'union'; readonly options: readonly SchemaNode[] }
    | { readonly kind: 'enum'; readonly values: readonly string[] }
    | { readonly kind: 'literal'; readonly values: readonly unknown[] }
    | {
        readonly kind: 'string';
        readonly unit: JournalUnit | null;
        /** L'objet qu'un identifiant nu désigne (`.meta({ ref })`), sinon `null`. */
        readonly ref: string | null;
        /** Le format zod (`date`, `datetime`), sinon `null`. */
        readonly format: string | null;
      }
    | { readonly kind: 'number'; readonly unit: JournalUnit | null }
    | { readonly kind: 'boolean' }
    /** Ce que le catalogue n'emploie pas aujourd'hui : rendu tel quel. */
    | { readonly kind: 'other' }
  );

const NODES = new WeakMap<PayloadShape, SchemaNode>();

/** L'arbre d'un schéma de charge — calculé une fois par schéma. */
export function schemaNode(shape: PayloadShape): SchemaNode {
  const known = NODES.get(shape);
  if (known !== undefined) {
    return known;
  }
  const node = build(shape);
  NODES.set(shape, node);
  return node;
}

/**
 * Le schéma qui **valide** cette charge, parmi les formes du type : la forme
 * courante d'abord, puis les anciennes (une ligne de 2026 se lit avec la forme
 * de 2026). `null` pour un type hors catalogue, ou une charge qu'aucune forme
 * n'accepte — le détail la rend alors brute, sans jamais lever.
 */
export function payloadNode(type: string, payload: unknown): SchemaNode | null {
  if (!isJournalFactType(type)) {
    return null;
  }
  const shape = journalPayloadShapes(type).find(
    (candidate) => candidate.safeParse(payload).success,
  );
  return shape === undefined ? null : schemaNode(shape);
}

/** Toutes les formes d'un type — courante d'abord. Pour le test de clôture. */
export function payloadNodes(type: string): readonly SchemaNode[] {
  return isJournalFactType(type) ? journalPayloadShapes(type).map(schemaNode) : [];
}

/**
 * La branche d'une union qui accepte la valeur — la première, comme zod ; une
 * valeur qu'aucune n'accepte garde la première, pour qu'un rendu reste possible.
 */
export function resolve(node: SchemaNode, value: unknown): SchemaNode {
  if (node.kind !== 'union') {
    return node;
  }
  const chosen = node.options.find((option) => option.accepts(value)) ?? node.options[0];
  return chosen === undefined ? node : resolve(chosen, value);
}

function build(shape: PayloadShape): SchemaNode {
  const accepts = (value: unknown): boolean => shape.safeParse(value).success;
  const def = shape.def;
  switch (def.type) {
    case 'object':
      return { accepts, kind: 'object', fields: fieldsOf('shape' in def ? def.shape : null) };
    case 'optional':
    case 'nullable': {
      const inner = childOf('innerType' in def ? def.innerType : null);
      return inner === null ? { accepts, kind: 'other' } : { accepts, kind: 'maybe', inner };
    }
    case 'array': {
      const element = childOf('element' in def ? def.element : null);
      return element === null ? { accepts, kind: 'other' } : { accepts, kind: 'array', element };
    }
    case 'record': {
      const value = childOf('valueType' in def ? def.valueType : null);
      return value === null ? { accepts, kind: 'other' } : { accepts, kind: 'record', value };
    }
    case 'union':
      return { accepts, kind: 'union', options: shapesOf('options' in def ? def.options : null) };
    case 'enum':
      return { accepts, kind: 'enum', values: enumValues('entries' in def ? def.entries : null) };
    case 'literal':
      return { accepts, kind: 'literal', values: arrayOf('values' in def ? def.values : null) };
    case 'string':
      return {
        accepts,
        kind: 'string',
        unit: unitOf(shape),
        ref: refOf(shape),
        format: 'format' in def && typeof def.format === 'string' ? def.format : null,
      };
    case 'number':
      return { accepts, kind: 'number', unit: unitOf(shape) };
    case 'boolean':
      return { accepts, kind: 'boolean' };
    default:
      return { accepts, kind: 'other' };
  }
}

function childOf(value: unknown): SchemaNode | null {
  return isShape(value) ? schemaNode(value) : null;
}

function fieldsOf(shape: unknown): readonly (readonly [string, SchemaNode])[] {
  if (typeof shape !== 'object' || shape === null) {
    return [];
  }
  return Object.entries(shape).flatMap(([key, child]): (readonly [string, SchemaNode])[] =>
    isShape(child) ? [[key, schemaNode(child)]] : [],
  );
}

function shapesOf(options: unknown): readonly SchemaNode[] {
  return arrayOf(options).flatMap((option) => (isShape(option) ? [schemaNode(option)] : []));
}

function enumValues(entries: unknown): readonly string[] {
  if (typeof entries !== 'object' || entries === null) {
    return [];
  }
  return Object.values(entries).filter((value): value is string => typeof value === 'string');
}

function arrayOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function unitOf(shape: PayloadShape): JournalUnit | null {
  const unit = shape.meta()?.['unit'];
  return JOURNAL_UNITS.find((known) => known === unit) ?? null;
}

function refOf(shape: PayloadShape): string | null {
  const ref = shape.meta()?.['ref'];
  return typeof ref === 'string' ? ref : null;
}

/**
 * Un enfant de `def` est un schéma du catalogue : les types de zod le déclarent
 * sous sa forme « cœur », sans `meta()`, alors qu'à l'exécution c'est la même
 * instance que celle qu'on a construite. On le vérifie au lieu de le supposer.
 */
function isShape(value: unknown): value is PayloadShape {
  return (
    typeof value === 'object' &&
    value !== null &&
    'def' in value &&
    'safeParse' in value &&
    typeof value.safeParse === 'function' &&
    'meta' in value &&
    typeof value.meta === 'function'
  );
}
