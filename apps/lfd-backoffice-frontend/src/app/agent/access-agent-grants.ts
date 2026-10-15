import type { RoleGrant } from '@lfd/contracts';

import type { ParsedPermission } from './access-agent-guard';

/**
 * **Changer UN droit d'un rôle**, et rien d'autre — le calcul pur de
 * `role_grant` et `role_revoke`. Le rôle part ENTIER au serveur (`PUT`
 * remplace la définition) : on part donc de ses droits lus, on change la
 * seule ressource visée, et on garde les autres dans leur ordre.
 *
 * Rend les droits à écrire et ce qui a changé, ou `null` quand il n'y a rien
 * à faire — l'outil le dit sans écrire.
 */
export interface GrantChange {
  readonly grants: readonly RoleGrant[];
  readonly said: string;
}

/** Accorder : la lecture, ou l'écriture (qui emporte la lecture). */
export function withGrant(
  grants: readonly RoleGrant[],
  wanted: ParsedPermission,
): GrantChange | null {
  const current = grants.find((grant) => grant.resource === wanted.resource);
  if (current !== undefined && (current.action === wanted.action || current.action === 'write')) {
    return null;
  }
  const next = { resource: wanted.resource, action: wanted.action };
  return {
    grants:
      current === undefined
        ? [...grants, next]
        : grants.map((grant) => (grant.resource === wanted.resource ? next : grant)),
    said:
      current === undefined
        ? `${wanted.permission} accordé`
        : `${wanted.resource} passé de la lecture à l’écriture`,
  };
}

/**
 * Retirer : l'écriture laisse la lecture ; la lecture retire la ressource
 * entière — on ne garde pas l'écriture d'un écran qu'on ne peut plus ouvrir.
 */
export function withoutGrant(
  grants: readonly RoleGrant[],
  wanted: ParsedPermission,
): GrantChange | null {
  const current = grants.find((grant) => grant.resource === wanted.resource);
  if (current === undefined || (wanted.action === 'write' && current.action === 'read')) {
    return null;
  }
  if (wanted.action === 'write') {
    return {
      grants: grants.map((grant) =>
        grant.resource === wanted.resource ? { resource: grant.resource, action: 'read' } : grant,
      ),
      said: `écriture de ${wanted.resource} retirée — la lecture reste`,
    };
  }
  return {
    grants: grants.filter((grant) => grant.resource !== wanted.resource),
    said:
      current.action === 'write'
        ? `${wanted.resource} retiré entièrement (lecture ET écriture)`
        : `${wanted.permission} retiré`,
  };
}
