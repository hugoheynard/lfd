import { Injectable } from "@nestjs/common";

import type { RevisableOrder, RevisionActor } from "../../domain/entities/order-revision.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderAccessReader } from "../../domain/ports/order-access.reader.js";
import { RevisableOrderReader } from "../../domain/ports/revisable-order.reader.js";
import { ensureOrderVisible } from "../../domain/services/order-access.js";

/**
 * **La commande à modifier, derrière son mur** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1) — partagé par
 * la modification et son devis.
 *
 * Le client ne voit que ses commandes personnelles et celles des sociétés
 * dont il est membre (`ensureOrderVisible`, le mur de `GET /orders/:id`) ;
 * hors mur, `404`, jamais `403`. L'équipe a déjà passé la porte staff.
 */
@Injectable()
export class RevisionWall {
  constructor(
    private readonly orders: RevisableOrderReader,
    private readonly access: OrderAccessReader,
  ) {}

  /** @throws {OrderNotFoundError} inconnue, ou hors du mur du client. */
  async find(orderId: string, actor: RevisionActor): Promise<RevisableOrder> {
    const order = await this.orders.find(orderId);
    if (order === null) {
      throw new OrderNotFoundError(orderId);
    }
    if (actor.kind === "customer") {
      const role =
        order.companyId === null ? null : await this.access.accessToOrder(actor.userId, order);
      ensureOrderVisible(order, actor.userId, role, orderId);
    }
    return order;
  }
}
