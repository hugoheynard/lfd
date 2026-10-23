import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import {
  ReviseOrderCommand,
  type ReviseOrderResult,
} from "../../orders/application/commands/revise-order.command.js";
import type { RequestedOrderChange } from "../domain/customer-request-details.js";
import { OrderChangeApplier } from "../domain/ports/order-change.applier.js";

/**
 * Appliquer une modification demandée, c'est **la** modification d'une
 * commande par l'équipe : `ReviseOrderCommand`, par le bus — le même handler
 * que `POST /admin/orders/:id/revisions`, ses règles et ses refus. Appelé
 * dans l'unité de travail de la réponse, il la rejoint.
 */
@Injectable()
export class BusOrderChangeApplier extends OrderChangeApplier {
  constructor(private readonly commands: CommandBus) {
    super();
  }

  async apply(
    orderId: string,
    staffUserId: string,
    baseRevision: number,
    change: RequestedOrderChange,
  ): Promise<number> {
    const result = await this.commands.execute<ReviseOrderCommand, ReviseOrderResult>(
      new ReviseOrderCommand(
        orderId,
        { kind: "staff", staffId: staffUserId },
        baseRevision,
        change,
      ),
    );
    return result.revision;
  }
}
