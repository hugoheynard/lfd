import type { SubscriptionStatus } from "@lfd/contracts";

/** Met en pause / reprend un panier récurrent. Mur : le propriétaire (`actorUserId`). */
export class SetSubscriptionStatusCommand {
  constructor(
    public readonly actorUserId: string,
    public readonly subscriptionId: string,
    public readonly status: SubscriptionStatus,
  ) {}
}
