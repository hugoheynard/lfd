import {
  STAFF_ROLE_LABELS,
  staffRoleSchema,
  type StaffRole,
  type StaffStatus,
} from '@lfd/contracts';

/**
 * Les rôles dans l'ordre du catalogue, du plus large au plus étroit. Les libellés
 * viennent du contrat : un rôle renommé se renomme partout, pas seulement ici.
 */
export const ROLE_OPTIONS: readonly { readonly value: StaffRole; readonly label: string }[] =
  staffRoleSchema.options.map((role) => ({ value: role, label: STAFF_ROLE_LABELS[role] }));

/**
 * Reconnaît un rôle rendu par un `<select>` natif, qui ne parle que `string`.
 * Une valeur inconnue est **ignorée** plutôt que forcée : mieux vaut ne rien
 * changer que d'écrire un rôle que le catalogue ne connaît pas.
 */
export function toStaffRole(value: string): StaffRole | null {
  const parsed = staffRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Le ton du badge d'état — seul ce qui appelle une action est signalé. */
export const STATUS_VARIANT: Readonly<Record<StaffStatus, 'neutral' | 'success' | 'warning'>> = {
  pending: 'neutral',
  invited: 'warning',
  active: 'success',
  suspended: 'warning',
};
