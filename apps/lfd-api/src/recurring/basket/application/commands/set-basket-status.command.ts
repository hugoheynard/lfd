import type { SubscriptionStatus } from "@lfd/contracts";

/** Met en pause / reprend un panier. Mur : son acheteur (`actorUserId`). */
export class SetBasketStatusCommand {
  constructor(
    readonly actorUserId: string,
    readonly basketId: string,
    readonly status: SubscriptionStatus,
  ) {}
}
