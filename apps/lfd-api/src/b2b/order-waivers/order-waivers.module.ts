import { Module } from "@nestjs/common";

import { OrderCutoffWaiverGate } from "../orders/domain/ports/order-cutoff-waiver.gate.js";
import { OrderLateFeeReader } from "../orders/domain/ports/order-late-fee.reader.js";
import { OrderLateFeeRepository } from "./domain/order-late-fee.repository.js";
import {
  GrantOrderCutoffWaiverHandler,
  ListOrderCutoffWaiversHandler,
  RevokeOrderCutoffWaiverHandler,
} from "./application/order-cutoff-waiver.handlers.js";
import {
  ClearOrderLateFeeHandler,
  ReadOrderLateFeeHandler,
  SaveOrderLateFeeHandler,
} from "./application/order-late-fee.handlers.js";
import { OrderCutoffWaiverRepository } from "./domain/order-cutoff-waiver.repository.js";
import { AdminOrderCutoffWaiversController } from "./http/admin-order-cutoff-waivers.controller.js";
import { AdminOrderLateFeeController } from "./http/admin-order-late-fee.controller.js";
import { PrismaOrderCutoffWaiverGate } from "./infrastructure/prisma-order-cutoff-waiver.gate.js";
import {
  PrismaOrderLateFeeReader,
  PrismaOrderLateFeeRepository,
} from "./infrastructure/prisma-order-late-fee.repository.js";
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
  controllers: [AdminOrderCutoffWaiversController, AdminOrderLateFeeController],
  providers: [
    { provide: OrderCutoffWaiverRepository, useClass: PrismaOrderCutoffWaiverRepository },
    { provide: OrderCutoffWaiverGate, useClass: PrismaOrderCutoffWaiverGate },
    // La surtaxe vit ici parce qu'elle n'existe QUE par la dérogation : c'est ce
    // qu'une dérogation coûte. Deux ports, encore — l'administration la règle,
    // la passation la lit.
    { provide: OrderLateFeeRepository, useClass: PrismaOrderLateFeeRepository },
    { provide: OrderLateFeeReader, useClass: PrismaOrderLateFeeReader },
    GrantOrderCutoffWaiverHandler,
    RevokeOrderCutoffWaiverHandler,
    ListOrderCutoffWaiversHandler,
    SaveOrderLateFeeHandler,
    ClearOrderLateFeeHandler,
    ReadOrderLateFeeHandler,
  ],
  exports: [OrderCutoffWaiverGate, OrderLateFeeReader],
})
export class OrderWaiversModule {}
