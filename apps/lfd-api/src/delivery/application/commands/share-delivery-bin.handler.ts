import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ContainerManagedOrders } from "../../../packing/channels/delivery/index.js";
import { BinsManagedAtPackingError } from "../../domain/errors/delivery-bin-declaration-errors.js";
import { DeliveryBinOffice } from "../delivery-bin-office.js";
import { ShareDeliveryBinCommand } from "./share-delivery-bin.command.js";

/**
 * **Partage un bac** (lot 4 bis, v2-4) — la route de la livraison. Les règles
 * et le fait sont ceux de `DeliveryBinOffice.share`.
 *
 * Refusé d'abord pour une commande dont les contenants se listent au colisage
 * (K2b, §5.1, B1) : le partage d'une moitié passe lui aussi par `BinDesk`.
 *
 * @throws {BinsManagedAtPackingError} et les refus de `DeliveryBinOffice.share`.
 */
@CommandHandler(ShareDeliveryBinCommand)
export class ShareDeliveryBinHandler implements ICommandHandler<ShareDeliveryBinCommand, string> {
  constructor(
    private readonly office: DeliveryBinOffice,
    private readonly managed: ContainerManagedOrders,
  ) {}

  async execute(command: ShareDeliveryBinCommand): Promise<string> {
    if (await this.managed.isManaged(command.payload.orderId)) {
      throw new BinsManagedAtPackingError();
    }
    return (await this.office.share(command.payload)).id;
  }
}
