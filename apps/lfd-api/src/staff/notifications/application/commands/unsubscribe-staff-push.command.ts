/** Commande **staff** : cet appareil ne veut plus être prévenu. */
export class UnsubscribeStaffPushCommand {
  constructor(readonly endpoint: string) {}
}
