import type { StaffRoleView, StaffStatus } from '@lfd/contracts';

/** Une entrée du sélecteur de rôle d'une fiche. */
export interface RoleOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Les rôles qu'une fiche peut recevoir : les définitions **actives** de la
 * table, dans l'ordre où le serveur les rend — plus l'enum écrit dans le code
 * (plan `documentation/staff/plan-roles-lus-en-base.md` §3.5). `superadmin` n'y
 * est jamais : c'est la porte de secours, pas un rôle qu'on donne.
 *
 * Le rôle que la fiche porte déjà reste proposé même s'il n'est plus actif :
 * un sélecteur qui n'afficherait pas la valeur courante laisserait croire
 * qu'elle est vide, et l'enregistrer la changerait sans qu'on l'ait voulu.
 */
export function roleOptionsFrom(
  definitions: readonly StaffRoleView[],
  current: RoleOption | null,
): readonly RoleOption[] {
  const active = definitions
    .filter((definition) => !definition.locked && definition.archivedAt === null)
    .map((definition) => ({ value: definition.key, label: definition.label }));
  if (current === null || active.some((option) => option.value === current.value)) {
    return active;
  }
  return [current, ...active];
}

/** Le ton du badge d'état — seul ce qui appelle une action est signalé. */
export const STATUS_VARIANT: Readonly<Record<StaffStatus, 'neutral' | 'success' | 'warning'>> = {
  pending: 'neutral',
  invited: 'warning',
  active: 'success',
  suspended: 'warning',
};
