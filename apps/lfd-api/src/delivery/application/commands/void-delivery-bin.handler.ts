import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ContainerManagedOrders } from "../../../packing/channels/delivery/index.js";
import { BinsManagedAtPackingError } from "../../domain/errors/delivery-bin-declaration-errors.js";
import { DeliveryBinOffice } from "../delivery-bin-office.js";
import { VoidDeliveryBinCommand } from "./void-delivery-bin.command.js";

/**
 * **Annule** l'étiquette d'un bac de trop (lot 4, L4-C19) — la route de la
 * livraison. Les règles et le fait sont ceux de `DeliveryBinOffice.void`.
 *
 * Refusé d'abord quand la commande du bac se gère au colisage (K2b, §5.1, B1) :
 * annuler ici laisserait un contenant pointer un bac mort.
 *
 * @throws {BinsManagedAtPackingError} et les refus de `DeliveryBinOffice.void`.
 */
@CommandHandler(VoidDeliveryBinCommand)
export class VoidDeliveryBinHandler implements ICommandHandler<VoidDeliveryBinCommand, void> {
  constructor(
    private readonly office: DeliveryBinOffice,
    private readonly managed: ContainerManagedOrders,
  ) {}

  async execute(command: VoidDeliveryBinCommand): Promise<void> {
    const orderId = await this.office.orderOf(command.binId);
    if (orderId !== null && (await this.managed.isManaged(orderId))) {
      throw new BinsManagedAtPackingError();
    }
    await this.office.void(command.binId);
  }
}
