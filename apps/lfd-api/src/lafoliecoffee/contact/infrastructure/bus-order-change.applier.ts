import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import {
  ReviseOrderCommand,
  type ReviseOrderResult,
} from "../../orders/revision/application/commands/revise-order.command.js";
import type { RequestedOrderChange } from "../domain/customer-request-details.js";
import {
  type AppliedOrderChange,
  OrderChangeApplier,
} from "../domain/ports/order-change.applier.js";

/**
 * Appliquer une modification demandée, c'est **la** modification d'une
 * commande par l'équipe : `ReviseOrderCommand`, par le bus — le même handler
 * que `POST /admin/orders/:id/revisions`, ses règles et ses refus. Appelé
 * dans l'unité de travail de la réponse, il la rejoint.
 *
 * Le total vu est celui que l'équipe a lu au devis, transmis tel quel (doc
 * `modifier-une-commande.md`, §2.3 (R14)) : le recalculer ici rendrait la comparaison vide.
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
    expectedTotalCents: number,
  ): Promise<AppliedOrderChange> {
    const result = await this.commands.execute<ReviseOrderCommand, ReviseOrderResult>(
      new ReviseOrderCommand(
        orderId,
        { kind: "staff", staffId: staffUserId },
        baseRevision,
        change,
        expectedTotalCents,
        // L'e-mail de la réponse part de `contact` (`customer.order-change-applied`) :
        // la révision ne doit pas en écrire un second.
        "change_request",
      ),
    );
    return {
      revision: result.revision,
      totalCents: result.totalCents,
      previousTotalCents: result.previousTotalCents,
      pretaxCents: result.pretaxCents,
      previousPretaxCents: result.previousPretaxCents,
      onAccount: result.onAccount,
      forCompany: result.forCompany,
    };
  }
}
