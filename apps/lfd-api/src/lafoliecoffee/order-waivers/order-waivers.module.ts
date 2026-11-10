import { Module } from "@nestjs/common";

import { OrderCutoffWaiverGate } from "../orders/domain/ports/order-cutoff-waiver.gate.js";
import { OrderDeliveryVatReader } from "../orders/domain/ports/order-delivery-vat.reader.js";
import { OrderLateFeeReader } from "../orders/domain/ports/order-late-fee.reader.js";
import { OrderDeliveryVatRepository } from "./domain/order-delivery-vat.repository.js";
import { ReadOrderDeliveryVatHandler } from "./application/read-order-delivery-vat.handler.js";
import { SaveOrderDeliveryVatHandler } from "./application/save-order-delivery-vat.handler.js";
import { AdminOrderDeliveryVatController } from "./http/admin-order-delivery-vat.controller.js";
import {
  PrismaOrderDeliveryVatReader,
  PrismaOrderDeliveryVatRepository,
} from "./infrastructure/prisma-order-delivery-vat.repository.js";
import { OrderLateFeeRepository } from "./domain/order-late-fee.repository.js";
import { ClearOrderLateFeeHandler } from "./application/clear-order-late-fee.handler.js";
import { GrantOrderCutoffWaiverHandler } from "./application/grant-order-cutoff-waiver.handler.js";
import { ListOpenOrderCutoffWaiversHandler } from "./application/list-open-order-cutoff-waivers.handler.js";
import { ListOrderCutoffWaiversHandler } from "./application/list-order-cutoff-waivers.handler.js";
import { OpenOrderCutoffWaiverReader } from "./domain/open-order-cutoff-waiver.reader.js";
import { PrismaOpenOrderCutoffWaiverReader } from "./infrastructure/prisma-open-order-cutoff-waiver.reader.js";
import { ReadOrderLateFeeHandler } from "./application/read-order-late-fee.handler.js";
import { RevokeOrderCutoffWaiverHandler } from "./application/revoke-order-cutoff-waiver.handler.js";
import { SaveOrderLateFeeHandler } from "./application/save-order-late-fee.handler.js";
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
  controllers: [
    AdminOrderCutoffWaiversController,
    AdminOrderLateFeeController,
    AdminOrderDeliveryVatController,
  ],
  providers: [
    { provide: OrderCutoffWaiverRepository, useClass: PrismaOrderCutoffWaiverRepository },
    { provide: OrderCutoffWaiverGate, useClass: PrismaOrderCutoffWaiverGate },
    // La liste transverse de Réglages › Commandes › Heure limite (lot O1c) :
    // un port de lecture à part, la liste ne fait que lire.
    { provide: OpenOrderCutoffWaiverReader, useClass: PrismaOpenOrderCutoffWaiverReader },
    // La surtaxe vit ici parce qu'elle n'existe QUE par la dérogation : c'est ce
    // qu'une dérogation coûte. Deux ports, encore — l'administration la règle,
    // la passation la lit.
    { provide: OrderLateFeeRepository, useClass: PrismaOrderLateFeeRepository },
    { provide: OrderLateFeeReader, useClass: PrismaOrderLateFeeReader },
    // La TVA de la livraison vit à côté de la surtaxe, son précédent (plan
    // `architecture-tva-des-frais-de-port.md`, V2) : un réglage unique que la
    // passation lit. Deux ports, encore.
    { provide: OrderDeliveryVatRepository, useClass: PrismaOrderDeliveryVatRepository },
    { provide: OrderDeliveryVatReader, useClass: PrismaOrderDeliveryVatReader },
    SaveOrderDeliveryVatHandler,
    ReadOrderDeliveryVatHandler,
    GrantOrderCutoffWaiverHandler,
    RevokeOrderCutoffWaiverHandler,
    ListOrderCutoffWaiversHandler,
    ListOpenOrderCutoffWaiversHandler,
    SaveOrderLateFeeHandler,
    ClearOrderLateFeeHandler,
    ReadOrderLateFeeHandler,
  ],
  exports: [OrderCutoffWaiverGate, OrderLateFeeReader, OrderDeliveryVatReader],
})
export class OrderWaiversModule {}
