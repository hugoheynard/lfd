import { Injectable } from "@nestjs/common";

import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderCardStandingReader } from "../../domain/ports/order-card-standing.reader.js";
import type { IncreaseOrderLabel } from "../../revision/application/services/card-increase-facts.js";

/**
 * Le numéro d'une commande, libellé des faits et des cloches d'un projet de
 * hausse (plan S2, R12) — lu dans l'unité de travail de l'appelant.
 */
@Injectable()
export class IncreaseOrderLabels {
  constructor(private readonly standings: OrderCardStandingReader) {}

  /** @throws {OrderNotFoundError} la commande du projet a disparu — la base et le code divergent. */
  async of(orderId: string): Promise<IncreaseOrderLabel> {
    const standing = await this.standings.ofOrder(orderId);
    if (standing === null) {
      throw new OrderNotFoundError(orderId);
    }
    return { orderId, orderNumber: standing.orderNumber };
  }
}
