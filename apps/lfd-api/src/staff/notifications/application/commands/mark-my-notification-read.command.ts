import type { StaffPermission } from "@lfd/contracts";

/**
 * Commande **staff** : marquer lue une de MES notifications, ou toutes (`id`
 * à `null`). `permissions` : l'effectif résolu par le guard — c'est le mur.
 */
export class MarkMyNotificationReadCommand {
  constructor(
    readonly id: string | null,
    readonly permissions: readonly StaffPermission[],
    readonly staffUserId: string,
  ) {}
}
