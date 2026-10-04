/** Annuler un contenant (K2b). */
export class VoidPackingContainerCommand {
  constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly containerId: string,
    readonly staffUserId: string,
  ) {}
}
