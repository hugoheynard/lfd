import type { FloorTarget, ScopeChoice } from './scope-picker/scope-picker';
import type { LimitCoverage } from './limit-coverage';
import type { LimitRow } from './limit-cells';

/** Ce que le panneau d'une limite doit savoir de la ligne qu'on ouvre. */
export function targetOf(row: LimitRow): FloorTarget {
  return {
    scope: row.scope,
    target: row.name,
    current: row.own,
    inherited: row.applied,
    canonicalMillicents: 'canonicalMillicents' in row ? row.canonicalMillicents : null,
  };
}

/**
 * **Les portées proposées par « Créer une limite »** : le catalogue, les
 * familles, puis chaque article — dans l'ordre de l'héritage, avec ce qui y
 * est déjà posé, pour qu'un choix déjà couvert s'ouvre en modification.
 */
export function scopeChoices(coverage: LimitCoverage | null): ScopeChoice[] {
  if (coverage === null) {
    return [];
  }
  const toChoice =
    (group: ScopeChoice['group']) =>
    (row: LimitRow): ScopeChoice => ({
      ...targetOf(row),
      key: row.key,
      group,
      label: 'sku' in row ? `${row.name} · ${row.sku}` : row.name,
    });
  return [
    toChoice('catalogue')(coverage.catalogue),
    ...coverage.shelves.map((shelf) => toChoice('family')(shelf.family)),
    ...coverage.shelves.flatMap((shelf) => shelf.articles.map(toChoice('article'))),
  ];
}
