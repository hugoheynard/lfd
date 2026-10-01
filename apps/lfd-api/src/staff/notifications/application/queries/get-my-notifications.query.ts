import type { StaffPermission } from "@lfd/contracts";

/**
 * Requête **staff** : mes notifications — celles adressées à un droit que je
 * tiens (`plan-a-la-porte.md`, B5). `permissions` : l'effectif résolu par le
 * guard pour la personne qui appelle, jamais une liste reçue.
 */
export class GetMyNotificationsQuery {
  constructor(readonly permissions: readonly StaffPermission[]) {}
}
