import { keyLabel } from './key-labels';
import { recordOf } from './payload-read';
import { formatNumber } from './units';
import { enumDomain, labelIn, literalLabel, recordKeysOf, stringDomain } from './values';

/**
 * **Une valeur de charge, en mots** — ce que le détail sous une phrase
 * (`detail-rows.ts`) écrit à droite d'un libellé quand la valeur n'a ni unité
 * ni objet cité : un code d'ensemble fermé, qu'il dit par le dictionnaire des
 * valeurs (`values/`), ou une valeur hors schéma, qu'il dit telle quelle.
 *
 * `field` est la clé de la charge sous laquelle la valeur est rangée — la plus
 * proche. C'est elle qui dit ce que sont les clés d'un record, ou l'ensemble
 * d'une chaîne que le catalogue laisse libre ; `null` à la racine.
 *
 * `missing` recueille les valeurs d'ensemble fermé restées sans mot
 * (`champ=valeur`) : le test de clôture les lit, l'écran les affiche brutes.
 */

/** Aucun, rien, vide : une absence se dit, elle ne se tait pas. */
export const NONE = 'aucun';

export type Field = string | null;

/** Une valeur d'énumération (`z.enum`), reconnue à l'ensemble de ses valeurs. */
export function enumText(
  values: readonly string[],
  value: unknown,
  field: Field,
  missing: Set<string>,
): string {
  const set = enumDomain(values);
  return orMissing(set === null ? null : labelIn(set, value), field, value, missing);
}

/** Un littéral (`z.literal`) : une chaîne a son mot, un booléen se dit « oui ». */
export function literalText(value: unknown, field: Field, missing: Set<string>): string {
  return typeof value === 'string'
    ? orMissing(literalLabel(value), field, value, missing)
    : raw(value);
}

/**
 * Une chaîne libre au schéma, mais prise dans un ensemble fermé sous ce champ
 * (`fields`, `role`, `channel`) : son mot si on le connaît, sinon telle quelle
 * — une ligne ancienne peut porter autre chose, et ce n'est pas une faute.
 */
export function closedStringText(field: Field, value: unknown): string {
  const set = field === null ? null : stringDomain(field);
  return (set === null ? null : labelIn(set, value)) ?? raw(value);
}

/**
 * La clé d'un record : le mot de l'ensemble que le champ déclare (un contexte
 * de vente), telle quelle pour des clés de donnée (une option saisie).
 */
export function recordKeyText(field: Field, key: string, missing: Set<string>): string {
  const keys = recordKeysOf(field);
  if (keys === 'free') {
    return key;
  }
  return orMissing(keys === null ? null : labelIn(keys, key), field, key, missing);
}

/** Une valeur hors schéma, lisible quand même. */
export function raw(value: unknown): string {
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

/** Le mot trouvé ; sans mot, la valeur brute — et le test de clôture le saura. */
function orMissing(
  label: string | null,
  field: Field,
  value: unknown,
  missing: Set<string>,
): string {
  if (label !== null) {
    return label;
  }
  missing.add(`${field ?? '(racine)'}=${raw(value)}`);
  return raw(value);
}
