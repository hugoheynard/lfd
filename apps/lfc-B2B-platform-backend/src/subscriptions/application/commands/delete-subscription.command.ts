/** Supprime un panier récurrent. Mur : le propriétaire (`actorUserId`). */
export class DeleteSubscriptionCommand {
  constructor(
    public readonly actorUserId: string,
    public readonly subscriptionId: string,
  ) {}
}
