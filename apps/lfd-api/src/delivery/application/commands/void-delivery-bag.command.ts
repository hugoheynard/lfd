/** Annuler l'étiquette d'un sac de trop (lot 4, L4-C19). */
export class VoidDeliveryBagCommand {
  constructor(readonly bagId: string) {}
}
