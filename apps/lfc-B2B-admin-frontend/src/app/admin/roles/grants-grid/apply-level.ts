import { staffResourceSchema, type RoleGrant, type StaffResource } from '@lfd/contracts';

/** Le niveau accordé sur une ressource. `none` n'est pas stocké : c'est l'absence. */
export type GrantLevel = 'none' | 'read' | 'write';

/**
 * Pose un niveau sur une ressource et rend la liste complète.
 *
 * Extraite du composant parce qu'elle porte deux règles qui méritent d'être
 * éprouvées sans monter de vue :
 *
 * - **`none` retire la ligne** plutôt que d'en écrire une à zéro. L'absence
 *   d'accès est l'absence de droit, pas un droit qui vaut rien — sinon deux
 *   écritures différentes signifieraient la même chose ;
 * - **l'ordre est celui du catalogue**, jamais celui de la saisie. Deux rôles
 *   aux mêmes droits doivent produire exactement la même ligne en base, sinon
 *   un diff de journal montre un changement là où rien n'a bougé.
 */
export function applyLevel(
  grants: readonly RoleGrant[],
  resource: StaffResource,
  level: GrantLevel,
): readonly RoleGrant[] {
  const next = new Map(grants.map((grant) => [grant.resource, grant.action]));
  if (level === 'none') {
    next.delete(resource);
  } else {
    next.set(resource, level);
  }
  return staffResourceSchema.options.flatMap((option) => {
    const action = next.get(option);
    return action === undefined ? [] : [{ resource: option, action }];
  });
}

/** Le niveau actuellement posé sur une ressource. */
export function levelOf(grants: readonly RoleGrant[], resource: StaffResource): GrantLevel {
  return grants.find((grant) => grant.resource === resource)?.action ?? 'none';
}
