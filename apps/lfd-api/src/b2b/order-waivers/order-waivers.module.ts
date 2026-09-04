import { Module } from "@nestjs/common";

import { OrderCutoffWaiverGate } from "../orders/domain/ports/order-cutoff-waiver.gate.js";
import {
  GrantOrderCutoffWaiverHandler,
  ListOrderCutoffWaiversHandler,
  RevokeOrderCutoffWaiverHandler,
} from "./application/order-cutoff-waiver.handlers.js";
import { OrderCutoffWaiverRepository } from "./domain/order-cutoff-waiver.repository.js";
import { AdminOrderCutoffWaiversController } from "./http/admin-order-cutoff-waivers.controller.js";
import { PrismaOrderCutoffWaiverGate } from "./infrastructure/prisma-order-cutoff-waiver.gate.js";
import { PrismaOrderCutoffWaiverRepository } from "./infrastructure/prisma-order-cutoff-waiver.repository.js";

/**
 * **Dérogations d'heure limite** — l'autorisation de commander en retard.
 *
 * Deux ports, et c'est délibéré : `OrderCutoffWaiverRepository` est la surface
 * d'ADMINISTRATION (accorder, retirer, lister), `OrderCutoffWaiverGate` celle de
 * la PASSATION (consulter, consommer). Un consommateur ne dépend que des
 * méthodes qu'il appelle — et composer une commande n'autorise pas à accorder
 * une exception.
 *
 * Le second est exporté : c'est le contexte `orders` qui l'appelle.
 */
@Module({
  controllers: [AdminOrderCutoffWaiversController],
  providers: [
    { provide: OrderCutoffWaiverRepository, useClass: PrismaOrderCutoffWaiverRepository },
    { provide: OrderCutoffWaiverGate, useClass: PrismaOrderCutoffWaiverGate },
    GrantOrderCutoffWaiverHandler,
    RevokeOrderCutoffWaiverHandler,
    ListOrderCutoffWaiversHandler,
  ],
  exports: [OrderCutoffWaiverGate],
})
export class OrderWaiversModule {}
