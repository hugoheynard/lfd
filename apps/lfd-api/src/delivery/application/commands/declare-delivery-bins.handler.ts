import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ContainerManagedOrders } from "../../../packing/channels/delivery/index.js";
import { BinsManagedAtPackingError } from "../../domain/errors/delivery-bin-declaration-errors.js";
import { DeliveryBinOffice } from "../delivery-bin-office.js";
import { DeclareDeliveryBinsCommand } from "./declare-delivery-bins.command.js";

/**
 * **Déclare des bacs d'un type** pour une commande (lot 4, L4-C16 ; lot 4
 * bis, tranche B) — la route de la livraison. Les règles et le fait au journal
 * sont ceux de `DeliveryBinOffice.declare`.
 *
 * Refusé d'abord pour une commande dont les contenants se listent au colisage
 * (K2b, §5.1, B1) : ses bacs ne naissent que par `BinDesk`.
 *
 * @throws {BinsManagedAtPackingError} et les refus de `DeliveryBinOffice.declare`.
 */
@CommandHandler(DeclareDeliveryBinsCommand)
export class DeclareDeliveryBinsHandler implements ICommandHandler<
  DeclareDeliveryBinsCommand,
  readonly string[]
> {
  constructor(
    private readonly office: DeliveryBinOffice,
    private readonly managed: ContainerManagedOrders,
  ) {}

  async execute(command: DeclareDeliveryBinsCommand): Promise<readonly string[]> {
    if (await this.managed.isManaged(command.payload.orderId)) {
      throw new BinsManagedAtPackingError();
    }
    const bins = await this.office.declare(command.payload);
    return bins.map((bin) => bin.id);
  }
}
