/**
 * **Appliquer la migration des opérations** depuis le référentiel (lot 3) —
 * signée de qui l'applique (`StaffUser.id`).
 */
export class ApplyOperationsMigrationCommand {
  constructor(readonly appliedBy: string | null) {}
}
