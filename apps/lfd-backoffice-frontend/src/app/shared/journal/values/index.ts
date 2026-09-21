import { ACCOUNTING_VALUES } from './accounting-values';
import { ACCOUNTS_VALUES } from './accounts-values';
import { COMMERCE_VALUES } from './commerce-values';
import { ORDERS_VALUES } from './orders-values';
import { PRICING_VALUES } from './pricing-values';
import { REFERENTIAL_VALUES } from './referential-values';
import { SHARED_VALUES } from './shared-values';
import { TEAM_VALUES } from './team-values';
import { ROOT_RECORD, type ValueDomain, type ValueFamily } from './value-domain';

/**
 * **Le dictionnaire des valeurs** — ce que le détail sous une phrase affiche à
 * droite quand la valeur est un code pris dans un ensemble fermé (plan
 * `documentation/journalisation/plan-phrases-du-journal.md`, lot D).
 *
 * Les familles vivent chacune dans leur fichier, une par famille du catalogue
 * des faits : un lot de phrases qui découvre une valeur à nommer l'ajoute à SA
 * famille, sans toucher ici. Ce fichier ne fait que les réunir.
 *
 * 🔴 Tenu par le test de clôture (`__tests__/closure.spec.ts`) : une valeur
 * d'énumération, un littéral ou une clé de record du catalogue sans libellé
 * fait échouer la CI, et deux familles qui donneraient deux mots à la même
 * valeur aussi.
 */
export const VALUE_FAMILIES: readonly ValueFamily[] = [
  SHARED_VALUES,
  REFERENTIAL_VALUES,
  COMMERCE_VALUES,
  ACCOUNTS_VALUES,
  ORDERS_VALUES,
  PRICING_VALUES,
  ACCOUNTING_VALUES,
  TEAM_VALUES,
];

export { ROOT_RECORD, type ValueDomain, type ValueFamily } from './value-domain';

/** L'ensemble d'une énumération : ses valeurs, triées, en une chaîne. */
function signature(values: readonly string[]): string {
  return [...values].sort().join('|');
}

/** Ce que les familles disent, réuni — et ce sur quoi elles se contredisent. */
interface Merged {
  readonly enums: ReadonlyMap<string, ValueDomain>;
  readonly literals: Readonly<Record<string, string>>;
  readonly recordKeys: ReadonlyMap<string, ValueDomain | 'free'>;
  readonly strings: ReadonlyMap<string, ValueDomain>;
  readonly conflicts: readonly string[];
}

function merge(families: readonly ValueFamily[]): Merged {
  const conflicts: string[] = [];
  const enums = new Map<string, ValueDomain>();
  const literals: Record<string, string> = {};
  const recordKeys = new Map<string, ValueDomain | 'free'>();
  const strings = new Map<string, ValueDomain>();
  for (const family of families) {
    for (const found of family.enums) {
      const key = signature(Object.keys(found.labels));
      const known = enums.get(key);
      if (known !== undefined && known !== found) {
        conflicts.push(`énumération déclarée deux fois : « ${known.name} » et « ${found.name} »`);
      }
      enums.set(key, found);
    }
    mergeLabels(literals, family.literals ?? {}, 'littéral', conflicts);
    for (const [field, found] of Object.entries(family.recordKeys ?? {})) {
      recordKeys.set(field, unite(recordKeys.get(field), found, `record ${field}`, conflicts));
    }
    for (const [field, found] of Object.entries(family.strings ?? {})) {
      const known = strings.get(field);
      const united = unite(known, found, `chaîne ${field}`, conflicts);
      if (united !== 'free') {
        strings.set(field, united);
      }
    }
  }
  return { enums, literals, recordKeys, strings, conflicts };
}

/**
 * Deux familles qui nomment les valeurs d'un même champ : leurs ensembles
 * s'additionnent (le champ `channel` sert à la diffusion ET aux demandes de
 * contact), tant qu'aucune valeur n'y reçoit deux mots.
 */
function unite(
  known: ValueDomain | 'free' | undefined,
  found: ValueDomain | 'free',
  where: string,
  conflicts: string[],
): ValueDomain | 'free' {
  if (known === undefined || known === found) {
    return found;
  }
  if (known === 'free' || found === 'free') {
    conflicts.push(`${where} : des clés libres pour une famille, un ensemble pour une autre`);
    return found;
  }
  const labels: Record<string, string> = { ...known.labels };
  mergeLabels(labels, found.labels, where, conflicts);
  return { name: `${known.name} / ${found.name}`, labels };
}

function mergeLabels(
  into: Record<string, string>,
  from: Readonly<Record<string, string>>,
  where: string,
  conflicts: string[],
): void {
  for (const [value, label] of Object.entries(from)) {
    const known = Object.hasOwn(into, value) ? into[value] : undefined;
    if (known !== undefined && known !== label) {
      conflicts.push(`${where} « ${value} » : « ${known} » et « ${label} »`);
    }
    into[value] = label;
  }
}

const MERGED = merge(VALUE_FAMILIES);

/** Les contradictions entre familles — vide, ou le test de clôture échoue. */
export const VALUE_CONFLICTS: readonly string[] = MERGED.conflicts;

/** L'ensemble qu'une énumération du catalogue désigne, reconnu à ses valeurs exactes. */
export function enumDomain(values: readonly string[]): ValueDomain | null {
  return MERGED.enums.get(signature(values)) ?? null;
}

/** Le mot d'un littéral du catalogue (`z.literal("staff")`), ou `null`. */
export function literalLabel(value: string): string | null {
  return Object.hasOwn(MERGED.literals, value) ? (MERGED.literals[value] ?? null) : null;
}

/**
 * Ce que sont les clés du record porté par ce champ — `null` : la charge
 * elle-même — : un ensemble nommé, `free` pour des clés de donnée, `null` si
 * personne ne l'a dit.
 */
export function recordKeysOf(field: string | null): ValueDomain | 'free' | null {
  return MERGED.recordKeys.get(field ?? ROOT_RECORD) ?? null;
}

/** L'ensemble fermé d'une chaîne que le catalogue type `z.string()`, par nom de champ. */
export function stringDomain(field: string): ValueDomain | null {
  return MERGED.strings.get(field) ?? null;
}

/** Le mot d'une valeur dans un ensemble, ou `null` si elle n'y est pas. */
export function labelIn(set: ValueDomain, raw: unknown): string | null {
  return typeof raw === 'string' && Object.hasOwn(set.labels, raw)
    ? (set.labels[raw] ?? null)
    : null;
}
