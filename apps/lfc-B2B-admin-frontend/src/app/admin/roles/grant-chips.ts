import { STAFF_RESOURCE_LABELS, staffResourceSchema, type RoleGrant } from '@lfd/contracts';

/** Les domaines ouverts à un niveau donné, dans l'ordre du catalogue. */
export interface GrantGroup {
  readonly level: 'write' | 'read';
  readonly label: string;
  readonly resources: readonly string[];
}

/**
 * Ce qu'un rôle ouvre, **groupé par niveau**.
 *
 * Deux lignes qui se lisent comme une phrase — « écriture : commandes,
 * croissance ; lecture : catalogue » — plutôt que douze pastilles bordées où
 * chaque libellé traîne son propre « écriture ». Le premier jet montrait les
 * douze domaines, dont sept vides : le regard devait trier pour trouver les
 * deux qui comptent.
 *
 * L'**écriture d'abord** : c'est ce qu'on cherche quand on audite un rôle. Et
 * l'ordre à l'intérieur d'un groupe reste celui du catalogue, jamais celui de
 * la saisie — c'est ce qui permet de comparer deux cartes sans les lire.
 */
export function grantGroups(grants: readonly RoleGrant[]): readonly GrantGroup[] {
  const levels = [
    { level: 'write', label: 'Écriture' },
    { level: 'read', label: 'Lecture' },
  ] as const;

  return levels.flatMap((entry) => {
    const resources = staffResourceSchema.options.flatMap((resource) =>
      grants.some((grant) => grant.resource === resource && grant.action === entry.level)
        ? [STAFF_RESOURCE_LABELS[resource]]
        : [],
    );
    return resources.length === 0 ? [] : [{ ...entry, resources }];
  });
}

/** Le nombre total de domaines du catalogue — le dénominateur de « 8 sur 12 ». */
export const RESOURCE_COUNT = staffResourceSchema.options.length;
