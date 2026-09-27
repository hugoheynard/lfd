import type { StaffPushTarget } from "../../domain/ports/staff-push.js";

/**
 * Commande **staff** : cet appareil veut être prévenu. `staffUserId` est une
 * trace de qui l'a abonné, pas un ciblage.
 */
export class SubscribeStaffPushCommand {
  constructor(
    readonly target: StaffPushTarget,
    readonly staffUserId: string,
  ) {}
}
