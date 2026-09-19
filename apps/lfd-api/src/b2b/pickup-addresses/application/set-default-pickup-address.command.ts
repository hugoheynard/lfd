/** Commande **staff** : désigner le point de retrait (global) par défaut. */
export class SetDefaultPickupAddressCommand {
  constructor(readonly id: string) {}
}
